(function (root) {
  'use strict';

  function createVehiclesView(deps) {
    var domain = deps.bookingDomain;
    var fmt = deps.formatters;
    var state = deps.state;

    var searchInput = document.getElementById('vehicleSearch');
    var availabilityFilter = document.getElementById('vehicleAvailabilityFilter');
    var tableBody = document.getElementById('vehicleBoardBody');
    var activeCountEl = document.getElementById('vehiclesActiveCount');
    var availableCountEl = document.getElementById('vehiclesAvailableCount');
    var inUseCountEl = document.getElementById('vehiclesInUseCount');

    function createAvailabilityBadge(statusKey) {
      var badge = document.createElement('span');
      if (statusKey === 'in_use') {
        badge.className = 'availability-badge availability-in-use';
        badge.textContent = 'In use';
      } else if (statusKey === 'available') {
        badge.className = 'availability-badge availability-available';
        badge.textContent = 'Available';
      } else {
        badge.className = 'availability-badge availability-inactive';
        badge.textContent = 'Inactive';
      }
      return badge;
    }

    function createAssetBadge(isActive) {
      var badge = document.createElement('span');
      badge.className = isActive ? 'user-status user-status-active' : 'user-status user-status-inactive';
      badge.textContent = isActive ? 'Active' : 'Inactive';
      return badge;
    }

    function buildScheduleCell(isActive, availability) {
      var cell = document.createElement('td');
      var primary = document.createElement('span');
      primary.className = 'cell-primary';
      var sub = document.createElement('span');
      sub.className = 'cell-sub';

      if (!isActive) {
        primary.textContent = 'Unavailable';
        sub.textContent = 'Inactive asset in MyGeotab';
        cell.appendChild(primary);
        cell.appendChild(sub);
        return cell;
      }

      if (availability.currentBooking) {
        var current = availability.currentBooking.details || {};
        var schedule = fmt.getScheduleSummary(current.startUtc, current.endUtc);
        primary.textContent = 'In trip: ' + schedule.timeText + (schedule.durationText ? ' (' + schedule.durationText + ')' : '');
        sub.textContent = (current.destination || current.purpose || 'Approved trip') +
          ' | Driver: ' + (current.driverName || current.driverLogin || 'Unassigned');
        cell.appendChild(primary);
        cell.appendChild(sub);
        return cell;
      }

      if (availability.nextBooking) {
        var next = availability.nextBooking.details || {};
        primary.textContent = 'Next: ' + fmt.formatDateRange(next.startUtc, next.endUtc);
        sub.textContent = (next.destination || next.purpose || 'Approved trip') +
          ' | Driver: ' + (next.driverName || next.driverLogin || 'Unassigned');
        cell.appendChild(primary);
        cell.appendChild(sub);
        return cell;
      }

      primary.textContent = 'No upcoming approved bookings';
      cell.appendChild(primary);
      return cell;
    }

    function render() {
      var devices = Array.isArray(state.devices) ? state.devices : [];
      var nowMs = Date.now();
      var activeCount = 0;
      var availableCount = 0;
      var inUseCount = 0;

      var rows = devices.map(function (device) {
        var isActive = fmt.isDeviceActive(device);
        var availability = isActive
          ? domain.getResourceAvailability(state.bookings, 'deviceId', device.id, nowMs)
          : { state: 'inactive', currentBooking: null, nextBooking: null };

        if (isActive) {
          activeCount += 1;
          if (availability.state === 'in_use') inUseCount += 1;
          else availableCount += 1;
        }

        return {
          device: device,
          isActive: isActive,
          availability: availability
        };
      });

      activeCountEl.textContent = String(activeCount);
      availableCountEl.textContent = String(availableCount);
      inUseCountEl.textContent = String(inUseCount);

      var search = searchInput.value.trim().toLowerCase();
      var filterVal = availabilityFilter.value || 'all';
      var filtered = rows.filter(function (entry) {
        if (filterVal !== 'all' && entry.availability.state !== filterVal) return false;
        if (!search) return true;
        var haystack = [entry.device.name || '', entry.device.id || ''].join(' ').toLowerCase();
        return haystack.indexOf(search) !== -1;
      }).sort(function (first, second) {
        var order = { in_use: 0, available: 1, inactive: 2 };
        var diff = order[first.availability.state] - order[second.availability.state];
        if (diff !== 0) return diff;
        return String(first.device.name || first.device.id).localeCompare(
          String(second.device.name || second.device.id)
        );
      });

      tableBody.textContent = '';
      if (filtered.length === 0) {
        tableBody.appendChild(fmt.createTableEmptyRow(
          4,
          devices.length
            ? 'No vehicles match the selected filters.'
            : 'No vehicles are available to this account.'
        ));
        return;
      }

      filtered.forEach(function (entry) {
        var tr = document.createElement('tr');

        var vehicleCell = document.createElement('td');
        var nameEl = document.createElement('span');
        nameEl.className = 'cell-primary';
        nameEl.textContent = entry.device.name || 'Unnamed vehicle';
        var idEl = document.createElement('span');
        idEl.className = 'cell-sub';
        idEl.textContent = 'ID: ' + entry.device.id;
        vehicleCell.appendChild(nameEl);
        vehicleCell.appendChild(idEl);
        tr.appendChild(vehicleCell);

        var availCell = document.createElement('td');
        availCell.appendChild(createAvailabilityBadge(entry.availability.state));
        tr.appendChild(availCell);

        tr.appendChild(buildScheduleCell(entry.isActive, entry.availability));

        var assetCell = document.createElement('td');
        assetCell.appendChild(createAssetBadge(entry.isActive));
        tr.appendChild(assetCell);

        tableBody.appendChild(tr);
      });
    }

    function bind() {
      searchInput.addEventListener('input', render);
      availabilityFilter.addEventListener('change', render);
    }

    return {
      bind: bind,
      render: render
    };
  }

  root.FleetAddIn = root.FleetAddIn || {};
  root.FleetAddIn.VehiclesView = {
    create: createVehiclesView
  };
}(typeof globalThis !== 'undefined' ? globalThis : this));
