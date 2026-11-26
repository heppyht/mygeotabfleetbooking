(function (root) {
  'use strict';

  function createUsersView(deps) {
    var userDomain = deps.userDomain;
    var bookingDomain = deps.bookingDomain;
    var fmt = deps.formatters;
    var state = deps.state;
    var onRefresh = deps.onRefresh;

    var workspace = document.getElementById('usersWorkspace');
    var restrictedNotice = document.getElementById('usersRestrictedNotice');
    var userDataStatus = document.getElementById('userDataStatus');
    var refreshUsersButton = document.getElementById('refreshUsersButton');

    var subTabDrivers = document.getElementById('subTabDrivers');
    var subTabAllUsers = document.getElementById('subTabAllUsers');
    var driversPanel = document.getElementById('driversSubPanel');
    var allUsersPanel = document.getElementById('allUsersSubPanel');

    var driverSearch = document.getElementById('driverSearch');
    var driverAvailabilityFilter = document.getElementById('driverAvailabilityFilter');
    var driverBoardBody = document.getElementById('driverBoardBody');
    var driversActiveCount = document.getElementById('driversActiveCount');
    var driversAvailableCount = document.getElementById('driversAvailableCount');
    var driversOnTripCount = document.getElementById('driversOnTripCount');

    var userSearch = document.getElementById('userSearch');
    var userStatusFilter = document.getElementById('userStatusFilter');
    var userDriverFilter = document.getElementById('userDriverFilter');
    var userListBody = document.getElementById('userListBody');

    var activeSubTab = 'drivers';

    function setStatus(message, isError) {
      userDataStatus.textContent = message;
      userDataStatus.setAttribute('data-error', isError ? 'true' : 'false');
    }

    function setLoading(isLoading) {
      refreshUsersButton.disabled = Boolean(isLoading);
    }

    function switchSubTab(tabName) {
      activeSubTab = tabName === 'all_users' ? 'all_users' : 'drivers';
      var isDrivers = activeSubTab === 'drivers';
      subTabDrivers.setAttribute('aria-selected', isDrivers ? 'true' : 'false');
      subTabAllUsers.setAttribute('aria-selected', isDrivers ? 'false' : 'true');
      driversPanel.hidden = !isDrivers;
      allUsersPanel.hidden = isDrivers;
    }

    function createDriverAvailabilityBadge(statusKey) {
      var badge = document.createElement('span');
      if (statusKey === 'in_use') {
        badge.className = 'availability-badge availability-in-use';
        badge.textContent = 'On trip';
      } else if (statusKey === 'available') {
        badge.className = 'availability-badge availability-available';
        badge.textContent = 'Available';
      } else {
        badge.className = 'availability-badge availability-inactive';
        badge.textContent = 'Inactive';
      }
      return badge;
    }

    function buildDriverScheduleCell(isActive, availability) {
      var cell = document.createElement('td');
      var primary = document.createElement('span');
      primary.className = 'cell-primary';
      var sub = document.createElement('span');
      sub.className = 'cell-sub';

      if (!isActive) {
        primary.textContent = 'Unavailable';
        sub.textContent = 'Account is not active';
        cell.appendChild(primary);
        cell.appendChild(sub);
        return cell;
      }

      if (availability.currentBooking) {
        var current = availability.currentBooking.details || {};
        var schedule = fmt.getScheduleSummary(current.startUtc, current.endUtc);
        primary.textContent = 'On trip: ' + schedule.timeText + (schedule.durationText ? ' (' + schedule.durationText + ')' : '');
        sub.textContent = 'Vehicle: ' + fmt.resolveDeviceName(current, state.devices) +
          ' | ' + (current.destination || current.purpose || 'Approved trip');
        cell.appendChild(primary);
        cell.appendChild(sub);
        return cell;
      }

      if (availability.nextBooking) {
        var next = availability.nextBooking.details || {};
        primary.textContent = 'Next: ' + fmt.formatDateRange(next.startUtc, next.endUtc);
        sub.textContent = 'Vehicle: ' + fmt.resolveDeviceName(next, state.devices) +
          ' | ' + (next.destination || next.purpose || 'Approved trip');
        cell.appendChild(primary);
        cell.appendChild(sub);
        return cell;
      }

      primary.textContent = 'No upcoming assigned trips';
      cell.appendChild(primary);
      return cell;
    }

    function renderDriversBoard() {
      driverBoardBody.textContent = '';
      if (state.usersLoadState === 'idle' || state.usersLoadState === 'loading') {
        driversActiveCount.textContent = '0';
        driversAvailableCount.textContent = '0';
        driversOnTripCount.textContent = '0';
        driverBoardBody.appendChild(fmt.createTableEmptyRow(
          4,
          state.usersLoadState === 'loading' ? 'Loading drivers...' : 'Select this tab to load drivers.'
        ));
        return;
      }
      if (state.usersLoadState === 'error') {
        driverBoardBody.appendChild(fmt.createTableEmptyRow(4, 'The driver list could not be loaded.'));
        return;
      }

      var nowMs = Date.now();
      var driverUsers = state.users.filter(function (user) {
        return user && user.isDriver === true;
      });
      var activeCount = 0;
      var availableCount = 0;
      var onTripCount = 0;

      var rows = driverUsers.map(function (driver) {
        var accountStatus = userDomain.getUserStatus(driver, nowMs);
        var isActive = accountStatus === 'Active';
        var availability = isActive
          ? bookingDomain.getResourceAvailability(state.bookings, 'driverId', driver.id, nowMs)
          : { state: 'inactive', currentBooking: null, nextBooking: null };

        if (isActive) {
          activeCount += 1;
          if (availability.state === 'in_use') onTripCount += 1;
          else availableCount += 1;
        }

        return {
          driver: driver,
          accountStatus: accountStatus,
          isActive: isActive,
          availability: availability
        };
      });

      driversActiveCount.textContent = String(activeCount);
      driversAvailableCount.textContent = String(availableCount);
      driversOnTripCount.textContent = String(onTripCount);

      var search = driverSearch.value.trim().toLowerCase();
      var filterVal = driverAvailabilityFilter.value || 'all';
      var filtered = rows.filter(function (entry) {
        if (filterVal !== 'all' && entry.availability.state !== filterVal) return false;
        if (!search) return true;
        var haystack = [userDomain.getUserFullName(entry.driver), entry.driver.login || ''].join(' ').toLowerCase();
        return haystack.indexOf(search) !== -1;
      }).sort(function (first, second) {
        var order = { in_use: 0, available: 1, inactive: 2 };
        var diff = order[first.availability.state] - order[second.availability.state];
        if (diff !== 0) return diff;
        return userDomain.getUserFullName(first.driver).localeCompare(userDomain.getUserFullName(second.driver));
      });

      if (filtered.length === 0) {
        driverBoardBody.appendChild(fmt.createTableEmptyRow(
          4,
          driverUsers.length
            ? 'No drivers match the selected filters.'
            : 'No driver accounts are visible to this session.'
        ));
        return;
      }

      filtered.forEach(function (entry) {
        var tr = document.createElement('tr');

        var nameCell = document.createElement('td');
        var nameEl = document.createElement('span');
        nameEl.className = 'cell-primary';
        nameEl.textContent = userDomain.getUserFullName(entry.driver);
        var emailEl = document.createElement('span');
        emailEl.className = 'cell-sub';
        emailEl.textContent = entry.driver.login || 'N/A';
        nameCell.appendChild(nameEl);
        nameCell.appendChild(emailEl);
        tr.appendChild(nameCell);

        var availCell = document.createElement('td');
        availCell.appendChild(createDriverAvailabilityBadge(entry.availability.state));
        tr.appendChild(availCell);

        tr.appendChild(buildDriverScheduleCell(entry.isActive, entry.availability));

        var statusCell = document.createElement('td');
        var badge = document.createElement('span');
        badge.className = 'user-status user-status-' + entry.accountStatus.toLowerCase();
        badge.textContent = entry.accountStatus;
        statusCell.appendChild(badge);
        tr.appendChild(statusCell);

        driverBoardBody.appendChild(tr);
      });
    }

    function renderAllUsersTable() {
      userListBody.textContent = '';
      if (state.usersLoadState === 'idle' || state.usersLoadState === 'loading') {
        userListBody.appendChild(fmt.createTableEmptyRow(
          5,
          state.usersLoadState === 'loading' ? 'Loading users...' : 'Select this tab to load user records.'
        ));
        return;
      }
      if (state.usersLoadState === 'error') {
        userListBody.appendChild(fmt.createTableEmptyRow(5, 'The user list could not be loaded.'));
        return;
      }

      var search = userSearch.value.trim().toLowerCase();
      var statusFilter = userStatusFilter.value;
      var driverFilter = userDriverFilter.value;

      var users = state.users.filter(function (user) {
        var clearance = userDomain.getUserClearanceLabel(
          user,
          state.securityGroupNames,
          state.securityGroupsLoaded
        );
        var searchable = [
          userDomain.getUserFullName(user),
          user.login,
          clearance,
          user.isDriver ? 'Driver' : 'Not a driver'
        ].join(' ').toLowerCase();
        var matchesDriver = driverFilter === 'all' ||
          (driverFilter === 'driver' && user.isDriver === true) ||
          (driverFilter === 'non_driver' && user.isDriver !== true);
        return (!search || searchable.indexOf(search) !== -1) &&
          (statusFilter === 'all' || userDomain.getUserStatus(user).toLowerCase() === statusFilter) &&
          matchesDriver;
      }).sort(function (first, second) {
        return userDomain.getUserFullName(first).localeCompare(userDomain.getUserFullName(second));
      });

      if (users.length === 0) {
        userListBody.appendChild(fmt.createTableEmptyRow(
          5,
          state.users.length ? 'No users match the selected filters.' : 'No user records are visible to this account.'
        ));
        return;
      }

      users.forEach(function (user) {
        var row = document.createElement('tr');
        [
          userDomain.getUserFullName(user),
          user.login || 'N/A',
          userDomain.getUserClearanceLabel(user, state.securityGroupNames, state.securityGroupsLoaded),
          userDomain.getUserDriverLabel(user)
        ].forEach(function (value) {
          var cell = document.createElement('td');
          cell.textContent = value;
          row.appendChild(cell);
        });

        var statusCell = document.createElement('td');
        var status = userDomain.getUserStatus(user);
        var statusBadge = document.createElement('span');
        statusBadge.className = 'user-status user-status-' + status.toLowerCase();
        statusBadge.textContent = status;
        statusCell.appendChild(statusBadge);
        row.appendChild(statusCell);
        userListBody.appendChild(row);
      });
    }

    function render() {
      if (!state.isAdministrator) {
        workspace.hidden = true;
        restrictedNotice.hidden = false;
        return;
      }
      workspace.hidden = false;
      restrictedNotice.hidden = true;
      renderDriversBoard();
      renderAllUsersTable();
    }

    function bind() {
      refreshUsersButton.addEventListener('click', function () {
        onRefresh(true);
      });
      subTabDrivers.addEventListener('click', function () {
        switchSubTab('drivers');
      });
      subTabAllUsers.addEventListener('click', function () {
        switchSubTab('all_users');
      });
      driverSearch.addEventListener('input', renderDriversBoard);
      driverAvailabilityFilter.addEventListener('change', renderDriversBoard);
      userSearch.addEventListener('input', renderAllUsersTable);
      userStatusFilter.addEventListener('change', renderAllUsersTable);
      userDriverFilter.addEventListener('change', renderAllUsersTable);
      switchSubTab('drivers');
    }

    return {
      bind: bind,
      render: render,
      setLoading: setLoading,
      setStatus: setStatus
    };
  }

  root.FleetAddIn = root.FleetAddIn || {};
  root.FleetAddIn.UsersView = {
    create: createUsersView
  };
}(typeof globalThis !== 'undefined' ? globalThis : this));
