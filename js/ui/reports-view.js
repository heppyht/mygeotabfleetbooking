(function (root) {
  'use strict';

  function createReportsView(deps) {
    var domain = deps.bookingDomain;
    var userDomain = deps.userDomain;
    var fmt = deps.formatters;
    var state = deps.state;

    var reportFilterForm = document.getElementById('reportFilterForm');
    var reportStartDate = document.getElementById('reportStartDate');
    var reportEndDate = document.getElementById('reportEndDate');
    var reportVehicle = document.getElementById('reportVehicle');
    var reportStatus = document.getElementById('reportStatus');
    var reportRequester = document.getElementById('reportRequester');
    var reportFilterMessage = document.getElementById('reportFilterMessage');
    var reportHistoryBody = document.getElementById('reportHistoryBody');
    var reportResultSummary = document.getElementById('reportResultSummary');
    var reportPageSummary = document.getElementById('reportPageSummary');
    var reportPreviousPage = document.getElementById('reportPreviousPage');
    var reportNextPage = document.getElementById('reportNextPage');
    var resetReportButton = document.getElementById('resetReportFilters');

    var reportPage = 0;
    var reportPageSize = 25;
    var appliedFilters = {
      fromDate: '',
      toDate: '',
      deviceId: '',
      status: 'all',
      requester: ''
    };

    function getReportVehicleKey(details) {
      return String((details && (details.deviceId || details.deviceName)) || '');
    }

    function formatRequesterLabel(login) {
      var matched = (state.users || []).find(function (user) {
        return user && String(user.login || '').toLowerCase() === login.toLowerCase();
      });
      if (!matched) return login;
      var fullName = userDomain.getUserFullName(matched);
      return fullName.toLowerCase() === login.toLowerCase()
        ? login
        : fullName + ' (' + login + ')';
    }

    function renderRequesterOptions() {
      var selectedValue = reportRequester.value;
      var requesters = [];
      var seen = {};

      state.bookings.forEach(function (record) {
        var raw = String((record.details && record.details.createdBy) || '').trim();
        var key = raw.toLowerCase();
        if (!key || seen[key]) return;
        seen[key] = true;
        requesters.push({
          value: raw,
          label: formatRequesterLabel(raw)
        });
      });

      requesters.sort(function (first, second) {
        return first.label.localeCompare(second.label);
      });

      reportRequester.textContent = '';
      var allOption = document.createElement('option');
      allOption.value = '';
      allOption.textContent = 'All requesters';
      reportRequester.appendChild(allOption);

      requesters.forEach(function (entry) {
        var option = document.createElement('option');
        option.value = entry.value;
        option.textContent = entry.label;
        reportRequester.appendChild(option);
      });

      reportRequester.value = requesters.some(function (entry) {
        return entry.value.toLowerCase() === selectedValue.toLowerCase();
      }) ? selectedValue : '';
    }

    function renderVehicleOptions() {
      var selectedValue = reportVehicle.value;
      var vehicles = [];

      function addVehicle(id, name) {
        if (!id) return;
        var key = String(id);
        var existing = vehicles.find(function (vehicle) { return vehicle.id === key; });
        if (existing) {
          if (!existing.name && name) existing.name = name;
          return;
        }
        vehicles.push({ id: key, name: String(name || key) });
      }

      state.devices.forEach(function (device) {
        addVehicle(device.id, device.name);
      });
      state.bookings.forEach(function (record) {
        addVehicle(getReportVehicleKey(record.details), record.details && record.details.deviceName);
      });
      vehicles.sort(function (first, second) {
        return first.name.localeCompare(second.name);
      });

      reportVehicle.textContent = '';
      var allOption = document.createElement('option');
      allOption.value = '';
      allOption.textContent = 'All vehicles';
      reportVehicle.appendChild(allOption);

      vehicles.forEach(function (vehicle) {
        var option = document.createElement('option');
        option.value = vehicle.id;
        option.textContent = vehicle.name;
        reportVehicle.appendChild(option);
      });

      reportVehicle.value = vehicles.some(function (vehicle) {
        return vehicle.id === selectedValue;
      }) ? selectedValue : '';
    }

    function render() {
      var filteredBookings = domain.filterBookings(state.bookings, appliedFilters);
      filteredBookings.sort(function (first, second) {
        var firstStart = Date.parse(first.details && first.details.startUtc);
        var secondStart = Date.parse(second.details && second.details.startUtc);
        if (!Number.isFinite(firstStart)) firstStart = Number.NEGATIVE_INFINITY;
        if (!Number.isFinite(secondStart)) secondStart = Number.NEGATIVE_INFINITY;
        return secondStart - firstStart;
      });

      var pendingCount = 0;
      var approvedCount = 0;
      var rejectedCount = 0;
      var cancelledCount = 0;
      filteredBookings.forEach(function (record) {
        var status = domain.normalizeStatus(record.details && record.details.status);
        if (status === 'pending') pendingCount += 1;
        if (status === 'approved' || status === 'confirmed') approvedCount += 1;
        if (status === 'rejected') rejectedCount += 1;
        if (status === 'cancelled') cancelledCount += 1;
      });

      document.getElementById('reportTotalBookings').textContent = String(filteredBookings.length);
      document.getElementById('reportPendingBookings').textContent = String(pendingCount);
      document.getElementById('reportApprovedBookings').textContent = String(approvedCount);
      document.getElementById('reportClosedBookings').textContent = String(rejectedCount + cancelledCount);
      document.getElementById('reportClosedBreakdown').textContent =
        rejectedCount + ' rejected, ' + cancelledCount + ' cancelled';

      reportHistoryBody.textContent = '';
      if (filteredBookings.length === 0) {
        reportHistoryBody.appendChild(fmt.createTableEmptyRow(
          9,
          state.bookings.length
            ? 'No bookings match the selected filters.'
            : 'No booking history is available.'
        ));
        reportResultSummary.textContent = '0 bookings';
        reportPageSummary.textContent = 'Showing 0 bookings';
        reportPreviousPage.disabled = true;
        reportNextPage.disabled = true;
        return;
      }

      var pageCount = Math.ceil(filteredBookings.length / reportPageSize);
      reportPage = Math.min(reportPage, pageCount - 1);
      var pageStart = reportPage * reportPageSize;
      var pageEnd = Math.min(pageStart + reportPageSize, filteredBookings.length);

      filteredBookings.slice(pageStart, pageEnd).forEach(function (record) {
        var details = record.details || {};
        var status = domain.normalizeStatus(details.status);
        var row = document.createElement('tr');
        var notesParts = [];
        if (details.approvalNotes) {
          notesParts.push(details.approvalNotes + (details.reviewedBy ? ' (' + details.reviewedBy + ')' : ''));
        } else if (details.reviewedBy) {
          notesParts.push('Reviewed by ' + details.reviewedBy);
        }
        if (status === 'cancelled' && details.cancellationReason) {
          notesParts.push(
            'Cancelled: ' + details.cancellationReason +
              (details.cancelledBy ? ' (' + details.cancelledBy + ')' : '')
          );
        }
        var notesText = notesParts.length ? notesParts.join(' | ') : '-';

        var cells = [
          fmt.resolveDeviceName(details, state.devices),
          details.driverName || details.driverLogin || 'Unassigned',
          details.createdBy || 'Unknown',
          details.destination || '-',
          details.purpose || '-',
          fmt.formatDate(details.startUtc),
          fmt.formatDate(details.endUtc)
        ];

        cells.forEach(function (value) {
          var cell = document.createElement('td');
          cell.textContent = value;
          row.appendChild(cell);
        });

        var statusCell = document.createElement('td');
        statusCell.appendChild(fmt.createStatusBadge(details.status));
        row.appendChild(statusCell);

        var notesCell = document.createElement('td');
        notesCell.textContent = notesText;
        row.appendChild(notesCell);

        reportHistoryBody.appendChild(row);
      });

      reportResultSummary.textContent = filteredBookings.length +
        (filteredBookings.length === 1 ? ' booking' : ' bookings');
      reportPageSummary.textContent = 'Showing ' + (pageStart + 1) + '-' + pageEnd +
        ' of ' + filteredBookings.length + ' bookings';
      reportPreviousPage.disabled = reportPage === 0;
      reportNextPage.disabled = reportPage >= pageCount - 1;
    }

    function applyFilters(event) {
      event.preventDefault();
      if (reportStartDate.value && reportEndDate.value &&
          reportStartDate.value > reportEndDate.value) {
        reportFilterMessage.textContent = 'End date must be on or after start date.';
        reportFilterMessage.hidden = false;
        return;
      }
      reportFilterMessage.textContent = '';
      reportFilterMessage.hidden = true;
      appliedFilters = {
        fromDate: reportStartDate.value,
        toDate: reportEndDate.value,
        deviceId: reportVehicle.value,
        status: reportStatus.value,
        requester: reportRequester.value
      };
      reportPage = 0;
      render();
    }

    function resetFilters() {
      reportFilterForm.reset();
      reportFilterMessage.textContent = '';
      reportFilterMessage.hidden = true;
      appliedFilters = {
        fromDate: '',
        toDate: '',
        deviceId: '',
        status: 'all',
        requester: ''
      };
      reportPage = 0;
      render();
    }

    function bind() {
      reportFilterForm.addEventListener('submit', applyFilters);
      resetReportButton.addEventListener('click', resetFilters);
      reportPreviousPage.addEventListener('click', function () {
        if (reportPage === 0) return;
        reportPage -= 1;
        render();
      });
      reportNextPage.addEventListener('click', function () {
        reportPage += 1;
        render();
      });
    }

    return {
      bind: bind,
      render: render,
      renderRequesterOptions: renderRequesterOptions,
      renderVehicleOptions: renderVehicleOptions
    };
  }

  root.FleetAddIn = root.FleetAddIn || {};
  root.FleetAddIn.ReportsView = {
    create: createReportsView
  };
}(typeof globalThis !== 'undefined' ? globalThis : this));
