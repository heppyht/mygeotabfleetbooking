(function (root, factory) {
  var formatters = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = formatters;
  } else {
    root.FleetAddIn = root.FleetAddIn || {};
    root.FleetAddIn.Formatters = formatters;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var STATUS_LABELS = {
    pending: 'Pending',
    approved: 'Approved',
    rejected: 'Rejected',
    cancelled: 'Cancelled',
    confirmed: 'Confirmed (Legacy)',
    unknown: 'Unknown'
  };

  var WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function errorText(error) {
    if (error && error.message) return error.message;
    if (typeof error === 'string') return error;
    try {
      return JSON.stringify(error);
    } catch (serializationError) {
      return String(error);
    }
  }

  function formatLocalInput(date) {
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' +
      pad(date.getDate()) + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes());
  }

  function formatTime24(date) {
    return pad(date.getHours()) + ':' + pad(date.getMinutes());
  }

  function formatDateParts(date, includeWeekday) {
    var base = pad(date.getDate()) + ' ' + MONTHS[date.getMonth()] + ' ' + date.getFullYear();
    return includeWeekday ? WEEKDAYS[date.getDay()] + ', ' + base : base;
  }

  function formatDate(value) {
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Invalid time';
    return formatDateParts(date, false) + ', ' + formatTime24(date);
  }

  function formatSubmittedAt(value) {
    if (!value) return '-';
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return pad(date.getDate()) + ' ' + MONTHS[date.getMonth()] + ', ' + formatTime24(date);
  }

  function formatDuration(startUtc, endUtc) {
    var startMs = Date.parse(startUtc);
    var endMs = Date.parse(endUtc);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      return '';
    }
    var totalMinutes = Math.round((endMs - startMs) / 60000);
    var days = Math.floor(totalMinutes / (24 * 60));
    var hours = Math.floor((totalMinutes % (24 * 60)) / 60);
    var minutes = totalMinutes % 60;

    var parts = [];
    if (days > 0) parts.push(days + 'd');
    if (hours > 0) parts.push(hours + 'h');
    if (minutes > 0 || parts.length === 0) parts.push(minutes + 'm');
    return parts.join(' ');
  }

  function isSameLocalDay(first, second) {
    return first.getFullYear() === second.getFullYear() &&
      first.getMonth() === second.getMonth() &&
      first.getDate() === second.getDate();
  }

  function getScheduleSummary(startUtc, endUtc) {
    var start = new Date(startUtc);
    var end = new Date(endUtc);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return {
        dateText: 'Invalid date',
        timeText: 'Invalid time',
        durationText: '',
        inlineText: 'Invalid time'
      };
    }

    var durationText = formatDuration(startUtc, endUtc);
    var durationSuffix = durationText ? ' (' + durationText + ')' : '';

    if (isSameLocalDay(start, end)) {
      var dateText = formatDateParts(start, true);
      var timeText = formatTime24(start) + ' - ' + formatTime24(end);
      return {
        dateText: dateText,
        timeText: timeText,
        durationText: durationText,
        inlineText: dateText + ', ' + timeText + durationSuffix
      };
    }

    var multiDateText = formatDateParts(start, false) + ' - ' + formatDateParts(end, false);
    var multiTimeText = formatTime24(start) + ' to ' + formatTime24(end);
    return {
      dateText: multiDateText,
      timeText: multiTimeText,
      durationText: durationText,
      inlineText: formatDate(startUtc) + ' - ' + formatDate(endUtc) + durationSuffix
    };
  }

  function formatDateRange(startUtc, endUtc) {
    return getScheduleSummary(startUtc, endUtc).inlineText;
  }

  function getStatusLabel(status) {
    var key = String(status || '').trim().toLowerCase();
    return STATUS_LABELS[key] || STATUS_LABELS.unknown;
  }

  function getStatusClass(status) {
    var key = String(status || '').trim().toLowerCase();
    return STATUS_LABELS[key] ? 'booking-status-' + key : 'booking-status-unknown';
  }

  function isDeviceActive(device) {
    if (!device) return false;
    if (!device.activeTo) return true;
    var activeTo = new Date(device.activeTo).getTime();
    return Number.isFinite(activeTo) && activeTo > Date.now();
  }

  function resolveDeviceName(details, devices) {
    if (!details || (!details.deviceId && !details.deviceName)) {
      return 'Unassigned';
    }
    var matched = (devices || []).find(function (item) {
      return item.id === details.deviceId;
    });
    return matched ? (matched.name || matched.id) : (details.deviceName || details.deviceId || 'Unassigned');
  }

  function createStatusBadge(status) {
    var badge = document.createElement('span');
    badge.className = 'booking-status ' + getStatusClass(status);
    badge.textContent = getStatusLabel(status);
    return badge;
  }

  function createEmptyBlock(message, extraClass) {
    var empty = document.createElement('p');
    empty.className = extraClass ? 'empty ' + extraClass : 'empty';
    empty.textContent = message;
    return empty;
  }

  function createTableEmptyRow(colSpan, message) {
    var row = document.createElement('tr');
    var cell = document.createElement('td');
    cell.colSpan = colSpan;
    cell.appendChild(createEmptyBlock(message, 'table-empty'));
    row.appendChild(cell);
    return row;
  }

  return {
    createEmptyBlock: createEmptyBlock,
    createStatusBadge: createStatusBadge,
    createTableEmptyRow: createTableEmptyRow,
    errorText: errorText,
    formatDate: formatDate,
    formatDateRange: formatDateRange,
    formatDuration: formatDuration,
    formatLocalInput: formatLocalInput,
    formatSubmittedAt: formatSubmittedAt,
    getScheduleSummary: getScheduleSummary,
    getStatusClass: getStatusClass,
    getStatusLabel: getStatusLabel,
    isDeviceActive: isDeviceActive,
    resolveDeviceName: resolveDeviceName
  };
}));
