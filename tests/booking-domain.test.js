const assert = require('node:assert/strict');
const test = require('node:test');
const domain = require('../js/domain/booking-domain');
const formatters = require('../js/ui/formatters');

test('validates required purpose, destination, and UTC interval with epochs', () => {
  const start = '2026-11-25T08:30';
  const end = '2026-11-25T10:00';
  const result = domain.validateBookingInput({
    startLocal: start,
    endLocal: end,
    purpose: '  Customer visit  ',
    destination: '  Cikarang Industrial Area  '
  });

  assert.equal(result.startUtc, new Date(start).toISOString());
  assert.equal(result.endUtc, new Date(end).toISOString());
  assert.equal(result.startEpoch, new Date(start).getTime());
  assert.equal(result.endEpoch, new Date(end).getTime());
  assert.equal(result.purpose, 'Customer visit');
  assert.equal(result.destination, 'Cikarang Industrial Area');

  assert.throws(() => domain.validateBookingInput({
    startLocal: start,
    endLocal: end,
    purpose: '   ',
    destination: 'Bandung'
  }), /Purpose is required/);

  assert.throws(() => domain.validateBookingInput({
    startLocal: start,
    endLocal: end,
    purpose: 'Visit',
    destination: ''
  }), /Destination is required/);

  assert.throws(() => domain.toUtcInterval(end, start), /must be after/);
});

test('validates approval decisions for approve and reject modes', () => {
  const approved = domain.validateApprovalDecision({
    decision: 'approve',
    deviceId: 'b1',
    driverId: 'u2',
    approvalNotes: '  Take keys at reception  '
  });
  assert.deepEqual(approved, {
    decision: 'approve',
    deviceId: 'b1',
    driverId: 'u2',
    approvalNotes: 'Take keys at reception'
  });

  assert.throws(() => domain.validateApprovalDecision({
    decision: 'approve',
    deviceId: '',
    driverId: 'u2'
  }), /active vehicle/);

  assert.throws(() => domain.validateApprovalDecision({
    decision: 'approve',
    deviceId: 'b1',
    driverId: ''
  }), /active driver/);

  const rejected = domain.validateApprovalDecision({
    decision: 'reject',
    deviceId: 'b1',
    driverId: 'u2',
    approvalNotes: '  All vehicles under maintenance  '
  });
  assert.deepEqual(rejected, {
    decision: 'reject',
    deviceId: null,
    driverId: null,
    approvalNotes: 'All vehicles under maintenance'
  });

  assert.throws(() => domain.validateApprovalDecision({
    decision: 'reject',
    approvalNotes: '   '
  }), /Rejection notes are required/);
});

test('detects overlapping vehicle and driver conflicts on approved and legacy confirmed bookings only', () => {
  const bookings = [
    {
      id: 'rec-approved',
      details: {
        deviceId: 'vehicle-1',
        driverId: 'driver-1',
        status: 'approved',
        startUtc: '2026-11-25T08:00:00.000Z',
        endUtc: '2026-11-25T10:00:00.000Z'
      }
    },
    {
      id: 'rec-legacy',
      details: {
        deviceId: 'vehicle-2',
        status: 'confirmed',
        startUtc: '2026-11-25T08:00:00.000Z',
        endUtc: '2026-11-25T10:00:00.000Z'
      }
    },
    {
      id: 'rec-pending',
      details: {
        deviceId: 'vehicle-3',
        driverId: 'driver-2',
        status: 'pending',
        startUtc: '2026-11-25T08:00:00.000Z',
        endUtc: '2026-11-25T10:00:00.000Z'
      }
    },
    {
      id: 'rec-cancelled',
      details: {
        deviceId: 'vehicle-3',
        driverId: 'driver-2',
        status: 'cancelled',
        startUtc: '2026-11-25T08:00:00.000Z',
        endUtc: '2026-11-25T10:00:00.000Z'
      }
    }
  ];

  // Overlapping intervals
  assert.equal(domain.hasVehicleConflict(bookings, 'vehicle-1', '2026-11-25T09:00:00.000Z', '2026-11-25T11:00:00.000Z'), true);
  assert.equal(domain.hasVehicleConflict(bookings, 'vehicle-2', '2026-11-25T09:00:00.000Z', '2026-11-25T11:00:00.000Z'), true);
  assert.equal(domain.hasVehicleConflict(bookings, 'vehicle-3', '2026-11-25T09:00:00.000Z', '2026-11-25T11:00:00.000Z'), false);
  assert.equal(domain.hasDriverConflict(bookings, 'driver-1', '2026-11-25T09:00:00.000Z', '2026-11-25T11:00:00.000Z'), true);
  assert.equal(domain.hasDriverConflict(bookings, 'driver-2', '2026-11-25T09:00:00.000Z', '2026-11-25T11:00:00.000Z'), false);

  // Adjacent interval is allowed
  assert.equal(domain.hasVehicleConflict(bookings, 'vehicle-1', '2026-11-25T10:00:00.000Z', '2026-11-25T11:00:00.000Z'), false);
  assert.equal(domain.hasDriverConflict(bookings, 'driver-1', '2026-11-25T10:00:00.000Z', '2026-11-25T11:00:00.000Z'), false);

  // Self exclusion works
  assert.equal(domain.hasVehicleConflict(bookings, 'vehicle-1', '2026-11-25T08:00:00.000Z', '2026-11-25T10:00:00.000Z', 'rec-approved'), false);

  // Conflicting resource lookup map
  const conflicts = domain.getConflictingResources(bookings, '2026-11-25T09:00:00.000Z', '2026-11-25T10:30:00.000Z');
  assert.equal(Boolean(conflicts.vehicles['vehicle-1']), true);
  assert.equal(Boolean(conflicts.vehicles['vehicle-2']), true);
  assert.equal(Boolean(conflicts.vehicles['vehicle-3']), false);
  assert.equal(Boolean(conflicts.drivers['driver-1']), true);
  assert.equal(Boolean(conflicts.drivers['driver-2']), false);
});

test('enforces requester edit and cancel rules by booking status and ownership', () => {
  assert.equal(domain.canRequesterEdit({ createdBy: 'heppy@opexcg.com', status: 'pending' }, 'HEPPY@opexcg.com'), true);
  assert.equal(domain.canRequesterEdit({ createdBy: 'heppy@opexcg.com', status: 'approved' }, 'heppy@opexcg.com'), false);
  assert.equal(domain.canRequesterEdit({ createdBy: 'heppy@opexcg.com', status: 'confirmed' }, 'heppy@opexcg.com'), false);
  assert.equal(domain.canRequesterEdit({ createdBy: 'other@opexcg.com', status: 'pending' }, 'heppy@opexcg.com'), false);

  assert.equal(domain.canRequesterCancel({ createdBy: 'heppy@opexcg.com', status: 'pending' }, 'heppy@opexcg.com'), true);
  assert.equal(domain.canRequesterCancel({ createdBy: 'heppy@opexcg.com', status: 'approved' }, 'heppy@opexcg.com'), true);
  assert.equal(domain.canRequesterCancel({ createdBy: 'heppy@opexcg.com', status: 'confirmed' }, 'heppy@opexcg.com'), true);
  assert.equal(domain.canRequesterCancel({ createdBy: 'heppy@opexcg.com', status: 'rejected' }, 'heppy@opexcg.com'), false);
  assert.equal(domain.canRequesterCancel({ createdBy: 'heppy@opexcg.com', status: 'cancelled' }, 'heppy@opexcg.com'), false);
  assert.equal(domain.canRequesterCancel({ createdBy: 'other@opexcg.com', status: 'approved' }, 'heppy@opexcg.com'), false);

  assert.equal(domain.canAdminCancel({ status: 'approved' }, true), true);
  assert.equal(domain.canAdminCancel({ status: 'confirmed' }, true), true);
  assert.equal(domain.canAdminCancel({ status: 'pending' }, true), false);
  assert.equal(domain.canAdminCancel({ status: 'rejected' }, true), false);
  assert.equal(domain.canAdminCancel({ status: 'cancelled' }, true), false);
  assert.equal(domain.canAdminCancel({ status: 'approved' }, false), false);

  assert.deepEqual(
    domain.validateAdminCancellation({ cancellationReason: '  Vehicle under maintenance  ' }),
    { cancellationReason: 'Vehicle under maintenance' }
  );
  assert.throws(() => domain.validateAdminCancellation({ cancellationReason: '   ' }), /Cancellation reason is required/);
});

test('filters My Bookings by current user and time range presets (default this_week)', () => {
  // Wednesday 2026-11-25 12:00 local -> week is Mon Nov 23 to Sun Nov 29
  const now = new Date('2026-11-25T12:00:00');
  const bookings = [
    {
      id: 'mine-this-week',
      details: {
        createdBy: 'heppy@opexcg.com',
        status: 'pending',
        startUtc: new Date('2026-11-25T15:00:00').toISOString(),
        endUtc: new Date('2026-11-25T16:00:00').toISOString()
      }
    },
    {
      id: 'other-this-week',
      details: {
        createdBy: 'andri@opexcg.com',
        status: 'pending',
        startUtc: new Date('2026-11-25T15:00:00').toISOString(),
        endUtc: new Date('2026-11-25T16:00:00').toISOString()
      }
    },
    {
      id: 'mine-next-week',
      details: {
        createdBy: 'heppy@opexcg.com',
        status: 'pending',
        startUtc: new Date('2026-12-02T09:00:00').toISOString(),
        endUtc: new Date('2026-12-02T10:00:00').toISOString()
      }
    },
    {
      id: 'mine-last-month',
      details: {
        createdBy: 'heppy@opexcg.com',
        status: 'approved',
        startUtc: new Date('2026-10-10T09:00:00').toISOString(),
        endUtc: new Date('2026-10-10T10:00:00').toISOString()
      }
    }
  ];

  assert.deepEqual(
    domain.filterMyBookings(bookings, 'HEPPY@opexcg.com', 'this_week', now).map((b) => b.id),
    ['mine-this-week']
  );
  assert.deepEqual(
    domain.filterMyBookings(bookings, 'heppy@opexcg.com', 'upcoming', now).map((b) => b.id),
    ['mine-this-week', 'mine-next-week']
  );
  assert.deepEqual(
    domain.filterMyBookings(bookings, 'heppy@opexcg.com', 'this_month', now).map((b) => b.id),
    ['mine-this-week']
  );
  assert.deepEqual(
    domain.filterMyBookings(bookings, 'heppy@opexcg.com', 'all', now).map((b) => b.id),
    ['mine-this-week', 'mine-next-week', 'mine-last-month']
  );
});

test('filters approval queue and report history across all statuses', () => {
  const bookings = [
    { id: 'p', details: { status: 'pending', createdBy: 'alice@opex.com', startUtc: '2026-11-25T08:00:00.000Z', endUtc: '2026-11-25T09:00:00.000Z' } },
    { id: 'a', details: { status: 'approved', deviceId: 'v1', createdBy: 'alice@opex.com', startUtc: '2026-11-25T08:00:00.000Z', endUtc: '2026-11-25T09:00:00.000Z' } },
    { id: 'c', details: { status: 'confirmed', deviceId: 'v1', createdBy: 'bob@opex.com', startUtc: '2026-11-25T08:00:00.000Z', endUtc: '2026-11-25T09:00:00.000Z' } },
    { id: 'r', details: { status: 'rejected', createdBy: 'alice@opex.com', startUtc: '2026-11-25T08:00:00.000Z', endUtc: '2026-11-25T09:00:00.000Z' } },
    { id: 'x', details: { status: 'cancelled', createdBy: 'bob@opex.com', startUtc: '2026-11-25T08:00:00.000Z', endUtc: '2026-11-25T09:00:00.000Z' } }
  ];

  assert.deepEqual(domain.filterApprovalQueue(bookings, 'pending').map((b) => b.id), ['p']);
  assert.deepEqual(domain.filterApprovalQueue(bookings, 'approved').map((b) => b.id), ['a', 'c']);
  assert.deepEqual(domain.filterApprovalQueue(bookings, 'rejected').map((b) => b.id), ['r']);
  assert.deepEqual(domain.filterApprovalQueue(bookings, 'all').map((b) => b.id), ['p', 'a', 'c', 'r', 'x']);

  assert.deepEqual(domain.filterBookings(bookings, { status: 'rejected', requester: 'alice@opex.com' }).map((b) => b.id), ['r']);
  assert.deepEqual(domain.filterBookings(bookings, { status: 'approved', deviceId: 'v1' }).map((b) => b.id), ['a']);
  assert.throws(() => domain.filterBookings(bookings, { fromDate: '2026-11-26', toDate: '2026-11-25' }), /on or after/);
});

test('computes real-time vehicle and driver availability from approved schedules', () => {
  const nowMs = Date.parse('2026-11-25T10:00:00.000Z');
  const bookings = [
    {
      id: 'active-now',
      details: {
        status: 'approved',
        deviceId: 'v1',
        driverId: 'd1',
        startUtc: '2026-11-25T09:00:00.000Z',
        endUtc: '2026-11-25T11:00:00.000Z'
      }
    },
    {
      id: 'next-later',
      details: {
        status: 'approved',
        deviceId: 'v2',
        driverId: 'd2',
        startUtc: '2026-11-25T13:00:00.000Z',
        endUtc: '2026-11-25T14:00:00.000Z'
      }
    },
    {
      id: 'next-sooner',
      details: {
        status: 'confirmed',
        deviceId: 'v2',
        driverId: 'd2',
        startUtc: '2026-11-25T11:30:00.000Z',
        endUtc: '2026-11-25T12:30:00.000Z'
      }
    },
    {
      id: 'pending-ignored',
      details: {
        status: 'pending',
        deviceId: 'v3',
        driverId: 'd3',
        startUtc: '2026-11-25T09:30:00.000Z',
        endUtc: '2026-11-25T10:30:00.000Z'
      }
    }
  ];

  const v1 = domain.getResourceAvailability(bookings, 'deviceId', 'v1', nowMs);
  assert.equal(v1.state, 'in_use');
  assert.equal(v1.currentBooking.id, 'active-now');

  const v2 = domain.getResourceAvailability(bookings, 'deviceId', 'v2', nowMs);
  assert.equal(v2.state, 'available');
  assert.equal(v2.currentBooking, null);
  assert.equal(v2.nextBooking.id, 'next-sooner');

  const d3 = domain.getResourceAvailability(bookings, 'driverId', 'd3', nowMs);
  assert.equal(d3.state, 'available');
  assert.equal(d3.currentBooking, null);
  assert.equal(d3.nextBooking, null);
});

test('formats 24-hour schedule summaries and durations for same-day and multi-day trips', () => {
  const startSameDay = new Date('2026-11-25T14:30:00').toISOString();
  const endSameDay = new Date('2026-11-25T16:00:00').toISOString();
  const sameDay = formatters.getScheduleSummary(startSameDay, endSameDay);

  assert.equal(sameDay.dateText, 'Wed, 25 Nov 2026');
  assert.equal(sameDay.timeText, '14:30 - 16:00');
  assert.equal(sameDay.durationText, '1h 30m');
  assert.equal(sameDay.inlineText, 'Wed, 25 Nov 2026, 14:30 - 16:00 (1h 30m)');

  const startMulti = new Date('2026-11-25T14:30:00').toISOString();
  const endMulti = new Date('2026-11-26T16:30:00').toISOString();
  const multiDay = formatters.getScheduleSummary(startMulti, endMulti);

  assert.equal(multiDay.dateText, '25 Nov 2026 - 26 Nov 2026');
  assert.equal(multiDay.durationText, '1d 2h');
});
