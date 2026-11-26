(function (root) {
  'use strict';

  function createBookingView(deps) {
    var domain = deps.bookingDomain;
    var apiService = deps.apiService;
    var fmt = deps.formatters;
    var state = deps.state;
    var onDataChanged = deps.onDataChanged;

    var form = document.getElementById('bookingForm');
    var formTitle = document.getElementById('formTitle');
    var startInput = document.getElementById('startLocal');
    var endInput = document.getElementById('endLocal');
    var purposeInput = document.getElementById('purpose');
    var destinationInput = document.getElementById('destination');
    var submitButton = document.getElementById('submitButton');
    var cancelEditButton = document.getElementById('cancelEditButton');
    var statusElement = document.getElementById('status');
    var rangeFilter = document.getElementById('bookingRangeFilter');
    var scheduleSummary = document.getElementById('bookingListSummary');
    var bookingList = document.getElementById('bookingList');

    var editingRecordId = null;

    function setStatus(message, isError) {
      statusElement.textContent = message;
      statusElement.setAttribute('data-error', isError ? 'true' : 'false');
    }

    function setDefaultTimes() {
      var start = new Date();
      start.setMinutes(Math.ceil((start.getMinutes() + 1) / 30) * 30, 0, 0);
      var end = new Date(start.getTime() + 60 * 60 * 1000);
      startInput.value = fmt.formatLocalInput(start);
      endInput.value = fmt.formatLocalInput(end);
    }

    function updateFormState() {
      var formEnabled = state.canBook && !state.isBusy;
      startInput.disabled = !formEnabled;
      endInput.disabled = !formEnabled;
      purposeInput.disabled = !formEnabled;
      destinationInput.disabled = !formEnabled;
      submitButton.disabled = !formEnabled;
      cancelEditButton.disabled = state.isBusy;
    }

    function resetForm() {
      editingRecordId = null;
      form.reset();
      formTitle.textContent = 'Create booking';
      submitButton.textContent = 'Submit request';
      cancelEditButton.hidden = true;
      setDefaultTimes();
      updateFormState();
    }

    function getRecordById(id) {
      return state.bookings.find(function (record) {
        return String(record.id) === String(id);
      });
    }

    function beginEdit(id) {
      var record = getRecordById(id);
      if (!record || !domain.canRequesterEdit(record.details, state.currentUserName)) return;

      editingRecordId = record.id;
      startInput.value = domain.toLocalDateTimeInput(record.details.startUtc);
      endInput.value = domain.toLocalDateTimeInput(record.details.endUtc);
      purposeInput.value = record.details.purpose || '';
      destinationInput.value = record.details.destination || '';
      formTitle.textContent = 'Edit pending booking';
      submitButton.textContent = 'Save changes';
      cancelEditButton.hidden = false;
      startInput.focus();
    }

    function buildAssignmentLine(details, status) {
      if (status === 'approved' || status === 'confirmed') {
        var vehicle = fmt.resolveDeviceName(details, state.devices);
        var driver = details.driverName || details.driverLogin || 'Unassigned';
        return 'Vehicle: ' + vehicle + ' | Driver: ' + driver;
      }
      if (status === 'pending') {
        return 'Vehicle & driver: Awaiting administrator approval';
      }
      if (status === 'rejected') {
        return details.reviewedBy ? 'Rejected by: ' + details.reviewedBy : 'Rejected by administrator';
      }
      var cancelledByOther = details.cancelledBy &&
        String(details.cancelledBy).toLowerCase() !== String(state.currentUserName || '').toLowerCase();
      var prefix = cancelledByOther
        ? 'Cancelled by administrator (' + details.cancelledBy + ')'
        : 'Cancelled booking';
      return details.deviceName || details.deviceId
        ? prefix + ' | Previous vehicle: ' + fmt.resolveDeviceName(details, state.devices)
        : prefix;
    }

    function renderList() {
      bookingList.textContent = '';
      var preset = rangeFilter.value || 'this_week';
      var myBookings = domain.filterMyBookings(state.bookings, state.currentUserName, preset);
      myBookings.sort(function (first, second) {
        return Date.parse(first.details.startUtc) - Date.parse(second.details.startUtc);
      });

      var totalMine = state.bookings.filter(function (record) {
        return domain.isBookingOwner(record.details, state.currentUserName);
      }).length;

      scheduleSummary.textContent = 'Showing ' + myBookings.length + ' of ' + totalMine +
        (totalMine === 1 ? ' booking created by you.' : ' bookings created by you.');

      if (myBookings.length === 0) {
        var emptyMessage = totalMine > 0
          ? 'No bookings in this time range. Switch the filter to Upcoming or All to see other schedules.'
          : 'You have not created any bookings yet.';
        bookingList.appendChild(fmt.createEmptyBlock(emptyMessage));
        return;
      }

      myBookings.forEach(function (record) {
        var details = record.details || {};
        var status = domain.normalizeStatus(details.status);
        var card = document.createElement('article');
        card.className = 'booking';

        var content = document.createElement('div');
        content.className = 'booking-details';

        var headerRow = document.createElement('div');
        headerRow.className = 'booking-header-row';
        var title = document.createElement('p');
        title.className = 'booking-title';
        title.textContent = details.destination || details.purpose || 'Booking request';
        headerRow.appendChild(title);
        headerRow.appendChild(fmt.createStatusBadge(status));
        content.appendChild(headerRow);

        var purposeMeta = document.createElement('p');
        purposeMeta.className = 'booking-purpose';
        purposeMeta.textContent = 'Purpose: ' + (details.purpose || 'Not specified');
        content.appendChild(purposeMeta);

        var scheduleMeta = document.createElement('p');
        scheduleMeta.className = 'booking-meta';
        scheduleMeta.textContent = fmt.formatDateRange(details.startUtc, details.endUtc);
        content.appendChild(scheduleMeta);

        var assignmentMeta = document.createElement('p');
        assignmentMeta.className = 'booking-meta';
        assignmentMeta.textContent = buildAssignmentLine(details, status);
        content.appendChild(assignmentMeta);

        if (details.approvalNotes) {
          var notes = document.createElement('p');
          notes.className = status === 'rejected'
            ? 'notes-callout notes-callout-rejected'
            : 'notes-callout';
          notes.textContent = (status === 'rejected' ? 'Rejection reason: ' : 'Admin notes: ') +
            details.approvalNotes;
          content.appendChild(notes);
        }

        if (status === 'cancelled' && details.cancellationReason) {
          var cancelReason = document.createElement('p');
          cancelReason.className = 'notes-callout notes-callout-rejected';
          cancelReason.textContent = 'Cancellation reason: ' + details.cancellationReason;
          content.appendChild(cancelReason);
        }

        card.appendChild(content);

        var actions = document.createElement('div');
        actions.className = 'booking-actions';
        if (domain.canRequesterEdit(details, state.currentUserName)) {
          var editButton = document.createElement('button');
          editButton.type = 'button';
          editButton.className = 'secondary';
          editButton.textContent = 'Edit';
          editButton.setAttribute('data-edit-id', record.id);
          actions.appendChild(editButton);
        }
        if (domain.canRequesterCancel(details, state.currentUserName)) {
          var cancelButton = document.createElement('button');
          cancelButton.type = 'button';
          cancelButton.className = 'danger';
          cancelButton.textContent = 'Cancel';
          cancelButton.setAttribute('data-cancel-id', record.id);
          actions.appendChild(cancelButton);
        }
        if (actions.childNodes.length) card.appendChild(actions);
        bookingList.appendChild(card);
      });
    }

    async function submitBooking(event) {
      event.preventDefault();
      if (!state.canBook || state.isBusy) return;

      state.isBusy = true;
      updateFormState();
      try {
        var validated = domain.validateBookingInput({
          startLocal: startInput.value,
          endLocal: endInput.value,
          purpose: purposeInput.value,
          destination: destinationInput.value
        });

        var existingRecord = null;
        if (editingRecordId) {
          var freshRecords = await apiService.getBookingRecords(state.api);
          existingRecord = freshRecords.find(function (record) {
            return String(record.id) === String(editingRecordId);
          }) || null;
          if (!existingRecord) {
            throw new Error('Booking not found. Reload the list and try again.');
          }
          if (!domain.canRequesterEdit(existingRecord.details, state.currentUserName)) {
            throw new Error('Only pending bookings created by you can be edited.');
          }
        }

        var now = new Date().toISOString();
        var details = Object.assign({}, existingRecord ? existingRecord.details : {}, {
          bookingKey: existingRecord ? existingRecord.details.bookingKey : apiService.createBookingKey(),
          status: 'pending',
          startUtc: validated.startUtc,
          endUtc: validated.endUtc,
          startEpoch: validated.startEpoch,
          endEpoch: validated.endEpoch,
          purpose: validated.purpose,
          destination: validated.destination,
          createdBy: existingRecord ? existingRecord.details.createdBy : state.currentUserName,
          createdAtUtc: existingRecord ? existingRecord.details.createdAtUtc : now,
          updatedAtUtc: now,
          deviceId: existingRecord ? (existingRecord.details.deviceId || null) : null,
          deviceName: existingRecord ? (existingRecord.details.deviceName || null) : null,
          driverId: existingRecord ? (existingRecord.details.driverId || null) : null,
          driverName: existingRecord ? (existingRecord.details.driverName || null) : null,
          driverLogin: existingRecord ? (existingRecord.details.driverLogin || null) : null,
          approvalNotes: existingRecord ? (existingRecord.details.approvalNotes || '') : '',
          reviewedBy: existingRecord ? (existingRecord.details.reviewedBy || null) : null,
          reviewedAtUtc: existingRecord ? (existingRecord.details.reviewedAtUtc || null) : null,
          cancelledAtUtc: existingRecord ? (existingRecord.details.cancelledAtUtc || null) : null
        });

        if (existingRecord) {
          await apiService.updateBookingRecord(state.api, existingRecord, details);
        } else {
          await apiService.addBookingRecord(state.api, details);
        }

        var updatedRecords = await onDataChanged(true);
        resetForm();
        if (!updatedRecords) {
          setStatus('Booking saved, but the list could not be refreshed. Reload the add-in to verify.', true);
          return;
        }

        var bounds = domain.getTimeRangeBounds(rangeFilter.value || 'this_week');
        var visibleInCurrentFilter = domain.isBookingInBounds(details, bounds);
        var baseMessage = existingRecord
          ? 'Pending booking updated.'
          : 'Booking request submitted (status: Pending approval).';
        setStatus(
          visibleInCurrentFilter
            ? baseMessage
            : baseMessage + ' This date is outside the current filter; switch the time range to Upcoming or All to view it.',
          false
        );
      } catch (error) {
        setStatus('Unable to save booking: ' + fmt.errorText(error), true);
      } finally {
        state.isBusy = false;
        updateFormState();
      }
    }

    async function cancelBooking(id) {
      if (state.isBusy) return;
      var localRecord = getRecordById(id);
      var isScheduled = localRecord && domain.isScheduledStatus(localRecord.details && localRecord.details.status);
      var promptText = isScheduled
        ? 'Cancel this approved booking? To change the schedule or assignment, you will need to create a new booking request.'
        : 'Cancel this pending booking request?';
      if (!window.confirm(promptText)) return;

      state.isBusy = true;
      updateFormState();
      try {
        var freshRecords = await apiService.getBookingRecords(state.api);
        var record = freshRecords.find(function (item) {
          return String(item.id) === String(id);
        });
        if (!record) {
          throw new Error('Booking not found. Reload the list and try again.');
        }
        if (!domain.canRequesterCancel(record.details, state.currentUserName)) {
          throw new Error('This booking cannot be cancelled.');
        }

        var now = new Date().toISOString();
        var details = Object.assign({}, record.details, {
          status: 'cancelled',
          cancelledBy: state.currentUserName,
          cancelledAtUtc: now,
          updatedAtUtc: now
        });
        await apiService.updateBookingRecord(state.api, record, details);

        var refreshed = await onDataChanged(true);
        if (String(editingRecordId) === String(id)) resetForm();
        if (!refreshed) {
          setStatus('Booking cancelled, but the list could not be refreshed. Reload the add-in to verify.', true);
          return;
        }
        setStatus('Booking cancelled successfully.', false);
      } catch (error) {
        setStatus('Unable to cancel booking: ' + fmt.errorText(error), true);
      } finally {
        state.isBusy = false;
        updateFormState();
      }
    }

    function bind() {
      form.addEventListener('submit', submitBooking);
      cancelEditButton.addEventListener('click', resetForm);
      rangeFilter.addEventListener('change', renderList);
      bookingList.addEventListener('click', function (event) {
        var editButton = event.target.closest('[data-edit-id]');
        var cancelButton = event.target.closest('[data-cancel-id]');
        if (editButton) beginEdit(editButton.getAttribute('data-edit-id'));
        if (cancelButton) cancelBooking(cancelButton.getAttribute('data-cancel-id'));
      });
      setDefaultTimes();
    }

    return {
      bind: bind,
      renderList: renderList,
      resetForm: resetForm,
      setStatus: setStatus,
      updateFormState: updateFormState
    };
  }

  root.FleetAddIn = root.FleetAddIn || {};
  root.FleetAddIn.BookingView = {
    create: createBookingView
  };
}(typeof globalThis !== 'undefined' ? globalThis : this));
