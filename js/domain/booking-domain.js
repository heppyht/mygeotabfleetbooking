(function (root, factory) {
  var domain = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = domain;
  } else {
    root.FleetAddIn = root.FleetAddIn || {};
    root.FleetAddIn.BookingDomain = domain;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var KNOWN_STATUSES = ['pending', 'approved', 'rejected', 'cancelled', 'confirmed'];

  function normalizeStatus(status) {
    var value = String(status || '').trim().toLowerCase();
    return KNOWN_STATUSES.indexOf(value) !== -1 ? value : 'unknown';
  }

  function isScheduledStatus(status) {
    var normalized = normalizeStatus(status);
    return normalized === 'approved' || normalized === 'confirmed';
  }

  function toUtcInterval(startLocal, endLocal) {
    if (!startLocal || !endLocal) {
      throw new Error('Start and end times are required.');
    }

    var start = new Date(startLocal);
    var end = new Date(endLocal);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
      throw new Error('Invalid time format.');
    }
    if (start.getTime() >= end.getTime()) {
      throw new Error('End time must be after start time.');
    }

    return {
      startUtc: start.toISOString(),
      endUtc: end.toISOString(),
      startEpoch: start.getTime(),
      endEpoch: end.getTime()
    };
  }

  function validateBookingInput(input) {
    input = input || {};
    var interval = toUtcInterval(input.startLocal, input.endLocal);
    var purpose = String(input.purpose || '').trim();
    var destination = String(input.destination || '').trim();

    if (!purpose) {
      throw new Error('Purpose is required.');
    }
    if (!destination) {
      throw new Error('Destination is required.');
    }

    return {
      startUtc: interval.startUtc,
      endUtc: interval.endUtc,
      startEpoch: interval.startEpoch,
      endEpoch: interval.endEpoch,
      purpose: purpose,
      destination: destination
    };
  }

  function validateApprovalDecision(input) {
    input = input || {};
    var decision = String(input.decision || '').trim().toLowerCase();
    var notes = String(input.approvalNotes || '').trim();

    if (decision !== 'approve' && decision !== 'reject') {
      throw new Error('Select either Approve or Reject.');
    }

    if (decision === 'approve') {
      var deviceId = String(input.deviceId || '').trim();
      var driverId = String(input.driverId || '').trim();
      if (!deviceId) {
        throw new Error('Select an active vehicle to approve this booking.');
      }
      if (!driverId) {
        throw new Error('Select an active driver to approve this booking.');
      }
      return {
        decision: 'approve',
        deviceId: deviceId,
        driverId: driverId,
        approvalNotes: notes
      };
    }

    if (!notes) {
      throw new Error('Rejection notes are required when rejecting a booking.');
    }

    return {
      decision: 'reject',
      deviceId: null,
      driverId: null,
      approvalNotes: notes
    };
  }

  function parseBookingInterval(details) {
    var start = Date.parse(details && details.startUtc);
    var end = Date.parse(details && details.endUtc);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
      return null;
    }
    return { start: start, end: end };
  }

  function intervalsOverlap(firstStart, firstEnd, secondStart, secondEnd) {
    return firstStart < secondEnd && firstEnd > secondStart;
  }

  function findResourceConflict(bookings, fieldName, resourceId, startUtc, endUtc, excludeRecordId) {
    var requestedStart = Date.parse(startUtc);
    var requestedEnd = Date.parse(endUtc);
    if (!Number.isFinite(requestedStart) || !Number.isFinite(requestedEnd) || requestedStart >= requestedEnd) {
      throw new Error('Invalid booking time range.');
    }
    if (!resourceId) return null;

    var targetId = String(resourceId);
    var excluded = excludeRecordId !== undefined && excludeRecordId !== null ? String(excludeRecordId) : null;

    for (var index = 0; index < bookings.length; index += 1) {
      var booking = bookings[index];
      if (!booking) continue;
      if (excluded !== null && String(booking.id) === excluded) continue;

      var details = booking.details || {};
      if (!isScheduledStatus(details.status)) continue;
      if (String(details[fieldName] || '') !== targetId) continue;

      var existing = parseBookingInterval(details);
      if (!existing) {
        throw new Error('Stored booking time data is invalid for ' + fieldName + ' ' + targetId + '.');
      }
      if (intervalsOverlap(requestedStart, requestedEnd, existing.start, existing.end)) {
        return booking;
      }
    }

    return null;
  }

  function hasVehicleConflict(bookings, deviceId, startUtc, endUtc, excludeRecordId) {
    return Boolean(findResourceConflict(bookings, 'deviceId', deviceId, startUtc, endUtc, excludeRecordId));
  }

  function hasDriverConflict(bookings, driverId, startUtc, endUtc, excludeRecordId) {
    return Boolean(findResourceConflict(bookings, 'driverId', driverId, startUtc, endUtc, excludeRecordId));
  }

  function getConflictingResources(bookings, startUtc, endUtc, excludeRecordId) {
    var requestedStart = Date.parse(startUtc);
    var requestedEnd = Date.parse(endUtc);
    var vehicles = {};
    var drivers = {};

    if (!Number.isFinite(requestedStart) || !Number.isFinite(requestedEnd) || requestedStart >= requestedEnd) {
      return { vehicles: vehicles, drivers: drivers };
    }

    var excluded = excludeRecordId !== undefined && excludeRecordId !== null ? String(excludeRecordId) : null;
    bookings.forEach(function (booking) {
      if (!booking) return;
      if (excluded !== null && String(booking.id) === excluded) return;

      var details = booking.details || {};
      if (!isScheduledStatus(details.status)) return;

      var existing = parseBookingInterval(details);
      if (!existing || !intervalsOverlap(requestedStart, requestedEnd, existing.start, existing.end)) return;

      if (details.deviceId && !vehicles[details.deviceId]) {
        vehicles[details.deviceId] = booking;
      }
      if (details.driverId && !drivers[details.driverId]) {
        drivers[details.driverId] = booking;
      }
    });

    return { vehicles: vehicles, drivers: drivers };
  }

  function getResourceAvailability(bookings, fieldName, resourceId, nowMs) {
    if (!resourceId) {
      return { state: 'available', currentBooking: null, nextBooking: null };
    }

    var now = Number.isFinite(nowMs) ? nowMs : Date.now();
    var targetId = String(resourceId);
    var currentBooking = null;
    var nextBooking = null;
    var nextStart = Number.POSITIVE_INFINITY;

    (bookings || []).forEach(function (booking) {
      if (!booking || !booking.details) return;
      var details = booking.details;
      if (!isScheduledStatus(details.status)) return;
      if (String(details[fieldName] || '') !== targetId) return;

      var interval = parseBookingInterval(details);
      if (!interval) return;

      if (interval.start <= now && now < interval.end) {
        if (!currentBooking || interval.end > Date.parse(currentBooking.details.endUtc)) {
          currentBooking = booking;
        }
      } else if (interval.start > now && interval.start < nextStart) {
        nextStart = interval.start;
        nextBooking = booking;
      }
    });

    return {
      state: currentBooking ? 'in_use' : 'available',
      currentBooking: currentBooking,
      nextBooking: nextBooking
    };
  }

  function isBookingOwner(details, currentUserName) {
    if (!details || !currentUserName) return false;
    return String(details.createdBy || '').trim().toLowerCase() === String(currentUserName).trim().toLowerCase();
  }

  function canRequesterEdit(details, currentUserName) {
    return isBookingOwner(details, currentUserName) && normalizeStatus(details.status) === 'pending';
  }

  function canRequesterCancel(details, currentUserName) {
    if (!isBookingOwner(details, currentUserName)) return false;
    var status = normalizeStatus(details.status);
    return status === 'pending' || status === 'approved' || status === 'confirmed';
  }

  function canAdminCancel(details, isAdministrator) {
    return Boolean(isAdministrator && details && isScheduledStatus(details.status));
  }

  function validateAdminCancellation(input) {
    input = input || {};
    var reason = String(input.cancellationReason || '').trim();
    if (!reason) {
      throw new Error('Cancellation reason is required.');
    }
    return {
      cancellationReason: reason
    };
  }

  function getTimeRangeBounds(preset, nowDate) {
    var now = nowDate instanceof Date ? new Date(nowDate.getTime()) : new Date();
    var key = String(preset || 'this_week').trim().toLowerCase();

    if (key === 'all') {
      return { fromTime: null, toExclusive: null };
    }

    if (key === 'upcoming') {
      return { fromTime: now.getTime(), toExclusive: null };
    }

    if (key === 'this_month') {
      var monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      var nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
      return { fromTime: monthStart.getTime(), toExclusive: nextMonthStart.getTime() };
    }

    var day = now.getDay();
    var diffToMonday = day === 0 ? -6 : 1 - day;
    var weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday, 0, 0, 0, 0);
    var nextWeekStart = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7, 0, 0, 0, 0);
    return { fromTime: weekStart.getTime(), toExclusive: nextWeekStart.getTime() };
  }

  function isBookingInBounds(details, bounds) {
    if (!bounds || (bounds.fromTime === null && bounds.toExclusive === null)) return true;
    var interval = parseBookingInterval(details);
    if (!interval) return false;
    if (bounds.fromTime !== null && interval.end <= bounds.fromTime) return false;
    if (bounds.toExclusive !== null && interval.start >= bounds.toExclusive) return false;
    return true;
  }

  function filterMyBookings(bookings, currentUserName, preset, nowDate) {
    if (!currentUserName) return [];
    var bounds = getTimeRangeBounds(preset || 'this_week', nowDate);
    return bookings.filter(function (booking) {
      var details = booking && booking.details;
      return isBookingOwner(details, currentUserName) && isBookingInBounds(details, bounds);
    });
  }

  function filterApprovalQueue(bookings, statusFilter) {
    var filter = String(statusFilter || 'pending').trim().toLowerCase();
    return bookings.filter(function (booking) {
      var status = normalizeStatus(booking && booking.details && booking.details.status);
      if (filter === 'all') return true;
      if (filter === 'approved') return status === 'approved' || status === 'confirmed';
      return status === filter;
    });
  }

  function filterBookings(bookings, filters) {
    filters = filters || {};
    var fromDate = filters.fromDate ? new Date(filters.fromDate + 'T00:00:00') : null;
    var toDate = filters.toDate ? new Date(filters.toDate + 'T00:00:00') : null;
    if ((fromDate && !Number.isFinite(fromDate.getTime())) ||
        (toDate && !Number.isFinite(toDate.getTime()))) {
      throw new Error('Invalid report date range.');
    }

    var fromTime = fromDate ? fromDate.getTime() : null;
    var toExclusive = null;
    if (toDate) {
      toDate.setDate(toDate.getDate() + 1);
      toExclusive = toDate.getTime();
    }
    if (fromTime !== null && toExclusive !== null && fromTime >= toExclusive) {
      throw new Error('End date must be on or after start date.');
    }

    var requester = String(filters.requester || '').trim().toLowerCase();
    var statusFilter = String(filters.status || 'all').trim().toLowerCase();
    var bounds = { fromTime: fromTime, toExclusive: toExclusive };

    return bookings.filter(function (booking) {
      var details = booking.details || {};
      var status = normalizeStatus(details.status);
      if (statusFilter && statusFilter !== 'all' && status !== statusFilter) return false;

      var deviceId = String(details.deviceId || details.deviceName || '');
      if (filters.deviceId && deviceId !== filters.deviceId) return false;
      if (requester && String(details.createdBy || '').trim().toLowerCase() !== requester) return false;
      if ((fromTime !== null || toExclusive !== null) && !isBookingInBounds(details, bounds)) return false;

      return true;
    });
  }

  function toLocalDateTimeInput(utcValue) {
    var date = new Date(utcValue);
    if (!Number.isFinite(date.getTime())) {
      throw new Error('Stored booking time is invalid.');
    }

    function pad(value) { return String(value).padStart(2, '0'); }
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' +
      pad(date.getDate()) + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes());
  }

  return {
    canAdminCancel: canAdminCancel,
    canRequesterCancel: canRequesterCancel,
    canRequesterEdit: canRequesterEdit,
    filterApprovalQueue: filterApprovalQueue,
    filterBookings: filterBookings,
    filterMyBookings: filterMyBookings,
    findResourceConflict: findResourceConflict,
    getConflictingResources: getConflictingResources,
    getResourceAvailability: getResourceAvailability,
    getTimeRangeBounds: getTimeRangeBounds,
    hasConflict: hasVehicleConflict,
    hasDriverConflict: hasDriverConflict,
    hasVehicleConflict: hasVehicleConflict,
    isBookingInBounds: isBookingInBounds,
    isBookingOwner: isBookingOwner,
    isScheduledStatus: isScheduledStatus,
    normalizeStatus: normalizeStatus,
    toLocalDateTimeInput: toLocalDateTimeInput,
    toUtcInterval: toUtcInterval,
    validateAdminCancellation: validateAdminCancellation,
    validateApprovalDecision: validateApprovalDecision,
    validateBookingInput: validateBookingInput
  };
}));
