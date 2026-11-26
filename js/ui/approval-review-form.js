(function (root) {
  'use strict';

  function formatConflictSlot(booking, fmt) {
    if (!booking || !booking.details || !fmt) return '';
    var summary = fmt.getScheduleSummary(booking.details.startUtc, booking.details.endUtc);
    return summary.timeText ? ' (' + summary.timeText + ')' : '';
  }

  function buildDecisionFieldset() {
    var fieldset = document.createElement('fieldset');
    fieldset.className = 'decision-group field-wide';
    var legend = document.createElement('legend');
    legend.textContent = 'Decision';
    fieldset.appendChild(legend);

    var approveLabel = document.createElement('label');
    approveLabel.className = 'decision-option';
    var approveRadio = document.createElement('input');
    approveRadio.type = 'radio';
    approveRadio.name = 'decision';
    approveRadio.value = 'approve';
    approveRadio.checked = true;
    approveLabel.appendChild(approveRadio);
    approveLabel.appendChild(document.createTextNode('Approve & assign'));

    var rejectLabel = document.createElement('label');
    rejectLabel.className = 'decision-option';
    var rejectRadio = document.createElement('input');
    rejectRadio.type = 'radio';
    rejectRadio.name = 'decision';
    rejectRadio.value = 'reject';
    rejectLabel.appendChild(rejectRadio);
    rejectLabel.appendChild(document.createTextNode('Reject'));

    fieldset.appendChild(approveLabel);
    fieldset.appendChild(rejectLabel);

    return {
      fieldset: fieldset,
      approveRadio: approveRadio,
      rejectRadio: rejectRadio
    };
  }

  function buildVehicleField(recordId, activeDevices, vehicleConflicts, fmt) {
    var field = document.createElement('div');
    field.className = 'field';
    var label = document.createElement('label');
    var selectId = 'approval-vehicle-' + recordId;
    label.htmlFor = selectId;
    label.textContent = 'Assign vehicle (Available) *';

    var select = document.createElement('select');
    select.id = selectId;
    select.name = 'deviceId';
    select.required = true;

    var availableDevices = [];
    var busyLabels = [];
    activeDevices.forEach(function (device) {
      var conflict = vehicleConflicts[device.id];
      if (conflict) {
        busyLabels.push((device.name || device.id) + formatConflictSlot(conflict, fmt));
      } else {
        availableDevices.push(device);
      }
    });

    var placeholder = document.createElement('option');
    placeholder.value = '';
    if (activeDevices.length === 0) {
      placeholder.textContent = 'No active vehicles found';
      select.disabled = true;
    } else if (availableDevices.length === 0) {
      placeholder.textContent = 'No vehicles available for this time slot';
      select.disabled = true;
    } else {
      placeholder.textContent = 'Select an available vehicle';
    }
    select.appendChild(placeholder);

    availableDevices.forEach(function (device) {
      var option = document.createElement('option');
      option.value = device.id;
      option.textContent = device.name || device.id;
      select.appendChild(option);
    });

    var hint = document.createElement('p');
    hint.className = availableDevices.length === 0 ? 'field-hint field-hint-warn' : 'field-hint';
    if (activeDevices.length === 0) {
      hint.textContent = 'No active vehicles found in this account.';
    } else if (availableDevices.length === 0) {
      hint.textContent = '0 of ' + activeDevices.length + ' active vehicles available (booked: ' +
        busyLabels.join(', ') + '). Switch to Reject or cancel a conflicting booking.';
    } else {
      hint.textContent = availableDevices.length + ' of ' + activeDevices.length + ' active ' +
        (activeDevices.length === 1 ? 'vehicle' : 'vehicles') + ' available.' +
        (busyLabels.length ? ' Booked: ' + busyLabels.join(', ') + '.' : '');
    }

    field.appendChild(label);
    field.appendChild(select);
    field.appendChild(hint);
    return { field: field, select: select, availableCount: availableDevices.length };
  }

  function buildDriverField(recordId, activeDrivers, driverConflicts, usersLoadState, userDomain, fmt) {
    var field = document.createElement('div');
    field.className = 'field';
    var label = document.createElement('label');
    var selectId = 'approval-driver-' + recordId;
    label.htmlFor = selectId;
    label.textContent = 'Assign driver (Available Driver) *';

    var select = document.createElement('select');
    select.id = selectId;
    select.name = 'driverId';
    select.required = true;

    var availableDrivers = [];
    var busyLabels = [];
    activeDrivers.forEach(function (driver) {
      var conflict = driverConflicts[driver.id];
      if (conflict) {
        busyLabels.push(userDomain.getUserFullName(driver) + formatConflictSlot(conflict, fmt));
      } else {
        availableDrivers.push(driver);
      }
    });

    var placeholder = document.createElement('option');
    placeholder.value = '';
    if (usersLoadState === 'loading') {
      placeholder.textContent = 'Loading active drivers...';
      select.disabled = true;
    } else if (usersLoadState === 'error') {
      placeholder.textContent = 'Unable to load drivers';
      select.disabled = true;
    } else if (activeDrivers.length === 0) {
      placeholder.textContent = 'No active drivers found';
      select.disabled = true;
    } else if (availableDrivers.length === 0) {
      placeholder.textContent = 'No drivers available for this time slot';
      select.disabled = true;
    } else {
      placeholder.textContent = 'Select an available driver';
    }
    select.appendChild(placeholder);

    availableDrivers.forEach(function (driver) {
      var option = document.createElement('option');
      option.value = driver.id;
      option.textContent = userDomain.getUserFullName(driver) +
        (driver.login ? ' (' + driver.login + ')' : '');
      select.appendChild(option);
    });

    var hint = document.createElement('p');
    if (usersLoadState === 'loading') {
      hint.className = 'field-hint';
      hint.textContent = 'Loading driver directory...';
    } else if (usersLoadState === 'error') {
      hint.className = 'field-hint field-hint-warn';
      hint.textContent = 'Unable to load drivers. Verify User read access.';
    } else if (activeDrivers.length === 0) {
      hint.className = 'field-hint field-hint-warn';
      hint.textContent = 'No active driver accounts found.';
    } else if (availableDrivers.length === 0) {
      hint.className = 'field-hint field-hint-warn';
      hint.textContent = '0 of ' + activeDrivers.length + ' active drivers available (assigned: ' +
        busyLabels.join(', ') + '). Switch to Reject or cancel a conflicting booking.';
    } else {
      hint.className = 'field-hint';
      hint.textContent = availableDrivers.length + ' of ' + activeDrivers.length + ' active ' +
        (activeDrivers.length === 1 ? 'driver' : 'drivers') + ' available.' +
        (busyLabels.length ? ' Assigned: ' + busyLabels.join(', ') + '.' : '');
    }

    field.appendChild(label);
    field.appendChild(select);
    field.appendChild(hint);
    return { field: field, select: select, availableCount: availableDrivers.length };
  }

  function build(options) {
    var record = options.record;
    var conflicts = options.conflicts;
    var activeDevices = options.activeDevices;
    var activeDrivers = options.activeDrivers;
    var usersLoadState = options.usersLoadState;
    var userDomain = options.userDomain;
    var fmt = options.formatters;
    var isSubmitting = options.isSubmitting;

    var panel = document.createElement('div');
    panel.className = 'approval-review-panel';

    var form = document.createElement('form');
    form.className = 'approval-review-form';
    form.setAttribute('data-review-form', record.id);

    var decision = buildDecisionFieldset();
    var vehicle = buildVehicleField(record.id, activeDevices, conflicts.vehicles, fmt);
    var driver = buildDriverField(record.id, activeDrivers, conflicts.drivers, usersLoadState, userDomain, fmt);

    var notesField = document.createElement('div');
    notesField.className = 'field field-wide';
    var notesLabel = document.createElement('label');
    var notesId = 'approval-notes-' + record.id;
    notesLabel.htmlFor = notesId;
    notesLabel.textContent = 'Notes (optional)';
    var notesInput = document.createElement('textarea');
    notesInput.id = notesId;
    notesInput.name = 'approvalNotes';
    notesInput.maxLength = 300;
    notesInput.placeholder = 'Optional dispatch notes (pickup instructions, key location)';
    notesField.appendChild(notesLabel);
    notesField.appendChild(notesInput);

    var inlineError = document.createElement('p');
    inlineError.className = 'approval-inline-error';
    inlineError.setAttribute('role', 'alert');
    inlineError.hidden = true;

    var actions = document.createElement('div');
    actions.className = 'form-actions field-wide';
    var submitBtn = document.createElement('button');
    submitBtn.type = 'submit';
    submitBtn.className = 'fm-btn-approve';
    submitBtn.textContent = 'Confirm approval';
    submitBtn.setAttribute('data-review-submit', 'true');

    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'secondary';
    closeBtn.textContent = 'Cancel';
    closeBtn.setAttribute('data-close-review', 'true');

    actions.appendChild(submitBtn);
    actions.appendChild(closeBtn);

    form.appendChild(decision.fieldset);
    form.appendChild(vehicle.field);
    form.appendChild(driver.field);
    form.appendChild(notesField);
    form.appendChild(inlineError);
    form.appendChild(actions);

    function syncDecisionMode() {
      var isReject = decision.rejectRadio.checked;
      var driversReady = usersLoadState !== 'loading' && usersLoadState !== 'error';
      var canApprove = vehicle.availableCount > 0 && driver.availableCount > 0 && driversReady;

      vehicle.field.hidden = isReject;
      driver.field.hidden = isReject;
      vehicle.select.required = !isReject;
      driver.select.required = !isReject;
      notesInput.required = isReject;
      notesLabel.textContent = isReject ? 'Rejection reason *' : 'Notes (optional)';
      notesInput.placeholder = isReject
        ? 'Explain why this booking request is rejected'
        : 'Optional dispatch notes (pickup instructions, key location)';
      submitBtn.className = isReject ? 'fm-btn-reject' : 'fm-btn-approve';
      submitBtn.textContent = isReject ? 'Confirm rejection' : 'Confirm approval';
      submitBtn.disabled = Boolean(isSubmitting) || (!isReject && !canApprove);
      inlineError.hidden = true;
    }

    decision.approveRadio.addEventListener('change', syncDecisionMode);
    decision.rejectRadio.addEventListener('change', syncDecisionMode);
    syncDecisionMode();

    panel.appendChild(form);
    return panel;
  }

  function buildCancelForm(options) {
    var record = options.record;
    var isSubmitting = options.isSubmitting;

    var panel = document.createElement('div');
    panel.className = 'approval-review-panel';

    var form = document.createElement('form');
    form.className = 'approval-review-form';
    form.setAttribute('data-admin-cancel-form', record.id);

    var reasonField = document.createElement('div');
    reasonField.className = 'field field-wide';
    var reasonLabel = document.createElement('label');
    var reasonId = 'approval-cancel-reason-' + record.id;
    reasonLabel.htmlFor = reasonId;
    reasonLabel.textContent = 'Cancellation reason *';
    var reasonInput = document.createElement('textarea');
    reasonInput.id = reasonId;
    reasonInput.name = 'cancellationReason';
    reasonInput.maxLength = 300;
    reasonInput.required = true;
    reasonInput.placeholder = 'Explain why this approved booking is being cancelled (e.g. vehicle maintenance, wrong assignment)';
    reasonField.appendChild(reasonLabel);
    reasonField.appendChild(reasonInput);

    var inlineError = document.createElement('p');
    inlineError.className = 'approval-inline-error';
    inlineError.setAttribute('role', 'alert');
    inlineError.hidden = true;

    var actions = document.createElement('div');
    actions.className = 'form-actions field-wide';
    var submitBtn = document.createElement('button');
    submitBtn.type = 'submit';
    submitBtn.className = 'fm-btn-reject';
    submitBtn.textContent = 'Confirm cancellation';
    submitBtn.setAttribute('data-review-submit', 'true');
    submitBtn.disabled = Boolean(isSubmitting);

    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'secondary';
    closeBtn.textContent = 'Keep booking';
    closeBtn.setAttribute('data-close-review', 'true');

    actions.appendChild(submitBtn);
    actions.appendChild(closeBtn);

    form.appendChild(reasonField);
    form.appendChild(inlineError);
    form.appendChild(actions);
    panel.appendChild(form);
    return panel;
  }

  function createSummaryItem(labelText, valueText, subText) {
    var item = document.createElement('div');
    item.className = 'trip-summary-item';

    var label = document.createElement('span');
    label.className = 'trip-summary-label';
    label.textContent = labelText;
    item.appendChild(label);

    var value = document.createElement('span');
    value.className = 'trip-summary-value';
    value.textContent = valueText;
    item.appendChild(value);

    if (subText) {
      var sub = document.createElement('span');
      sub.className = 'trip-summary-sub';
      sub.textContent = subText;
      item.appendChild(sub);
    }
    return item;
  }

  function buildTripSummaryGrid(options) {
    var details = options.details || {};
    var users = options.users || [];
    var userDomain = options.userDomain;
    var fmt = options.formatters;

    var email = String(details.createdBy || '').trim();
    var requesterName = email || 'Unknown';
    var requesterSub = '';
    if (email) {
      var matched = users.find(function (user) {
        return user && String(user.login || '').toLowerCase() === email.toLowerCase();
      });
      if (matched) {
        var fullName = userDomain.getUserFullName(matched);
        if (fullName.toLowerCase() !== email.toLowerCase()) {
          requesterName = fullName;
          requesterSub = email;
        }
      }
    }

    var schedule = fmt.getScheduleSummary(details.startUtc, details.endUtc);
    var timeSub = schedule.durationText ? 'Duration: ' + schedule.durationText : '';

    var grid = document.createElement('div');
    grid.className = 'trip-summary-grid';
    grid.appendChild(createSummaryItem('Requester', requesterName, requesterSub));
    grid.appendChild(createSummaryItem('Date', schedule.dateText));
    grid.appendChild(createSummaryItem('Time & duration', schedule.timeText, timeSub));
    grid.appendChild(createSummaryItem('Submitted', fmt.formatSubmittedAt(details.createdAtUtc)));
    return grid;
  }

  root.FleetAddIn = root.FleetAddIn || {};
  root.FleetAddIn.ApprovalReviewForm = {
    build: build,
    buildCancelForm: buildCancelForm,
    buildTripSummaryGrid: buildTripSummaryGrid
  };
}(typeof globalThis !== 'undefined' ? globalThis : this));
