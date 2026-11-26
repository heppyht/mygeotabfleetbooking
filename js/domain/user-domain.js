(function (root, factory) {
  var domain = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = domain;
  } else {
    root.FleetAddIn = root.FleetAddIn || {};
    root.FleetAddIn.UserDomain = domain;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var BUILT_IN_CLEARANCE_NAMES = {
    everythingsecurity: 'Administrator',
    supervisorsecurity: 'Supervisor',
    defaultsecurity: 'Default user',
    driveusersecurity: 'Drive App user',
    viewonlysecurity: 'View only',
    nothingsecurity: 'Nothing'
  };

  function getUserFullName(user) {
    if (!user) return 'Unnamed user';
    var fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    return fullName || user.login || user.name || 'Unnamed user';
  }

  function getUserRoleLabel(user) {
    var role = user && user.userRole;
    if (!role) return 'Not assigned';
    var roleLabel = typeof role === 'string' || typeof role === 'number'
      ? String(role)
      : String(role.name || role.id || 'Not assigned');
    roleLabel = roleLabel.trim();
    if (roleLabel.toLowerCase() === 'other' && user.customUserRole) {
      return 'Other: ' + String(user.customUserRole).trim();
    }
    return roleLabel || 'Not assigned';
  }

  function getUserDriverLabel(user) {
    return user && user.isDriver === true ? 'Driver' : 'Not a driver';
  }

  function getUserStatus(user, nowMs) {
    if (!user) return 'Unknown';
    var now = Number.isFinite(nowMs) ? nowMs : Date.now();
    var activeFrom = Date.parse(user.activeFrom);
    var activeTo = Date.parse(user.activeTo);
    if (!Number.isFinite(activeFrom) || !Number.isFinite(activeTo)) return 'Unknown';
    if (now < activeFrom) return 'Scheduled';
    if (now > activeTo) return 'Inactive';
    return 'Active';
  }

  function resolveClearanceNames(user, securityGroupNames) {
    var groupMap = securityGroupNames || {};
    var groups = user && Array.isArray(user.securityGroups) ? user.securityGroups : [];
    return groups.map(function (group) {
      var id = typeof group === 'string' ? group : group && group.id;
      var rawName = id ? groupMap[id] || '' : '';
      var normalized = rawName.toLowerCase().replace(/[^a-z]/g, '');
      return BUILT_IN_CLEARANCE_NAMES[normalized] || rawName;
    }).filter(Boolean);
  }

  function getUserClearanceLabel(user, securityGroupNames, securityGroupsLoaded) {
    var groups = user && Array.isArray(user.securityGroups) ? user.securityGroups : [];
    var names = resolveClearanceNames(user, securityGroupNames);
    if (names.length) return names.join(', ');
    return groups.length && securityGroupsLoaded ? 'Unmapped clearance' : 'Not available';
  }

  function isAdministrator(user, securityGroupNames, securityGroupsLoaded) {
    if (!user || !securityGroupsLoaded) return false;
    var groups = Array.isArray(user.securityGroups) ? user.securityGroups : [];
    if (groups.length === 0) return false;

    var hasBuiltInAdminId = groups.some(function (group) {
      var id = typeof group === 'string' ? group : group && group.id;
      return id === 'GroupEverythingSecurityId';
    });
    if (hasBuiltInAdminId) return true;

    var resolved = resolveClearanceNames(user, securityGroupNames);
    return resolved.some(function (name) {
      return name.toLowerCase() === 'administrator';
    });
  }

  function getActiveDrivers(users, nowMs) {
    if (!Array.isArray(users)) return [];
    return users.filter(function (user) {
      return Boolean(user && user.id && user.isDriver === true && getUserStatus(user, nowMs) === 'Active');
    }).sort(function (first, second) {
      return getUserFullName(first).localeCompare(getUserFullName(second));
    });
  }

  return {
    BUILT_IN_CLEARANCE_NAMES: BUILT_IN_CLEARANCE_NAMES,
    getActiveDrivers: getActiveDrivers,
    getUserClearanceLabel: getUserClearanceLabel,
    getUserDriverLabel: getUserDriverLabel,
    getUserFullName: getUserFullName,
    getUserRoleLabel: getUserRoleLabel,
    getUserStatus: getUserStatus,
    isAdministrator: isAdministrator,
    resolveClearanceNames: resolveClearanceNames
  };
}));
