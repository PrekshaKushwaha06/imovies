import test from 'node:test';
import assert from 'node:assert/strict';
import { filterAdminBookings, getAdminBookingStats } from '../src/adminBookingStats.js';

const sampleBookings = [
  { id: 'booking-1', status: 'active' },
  { id: 'booking-2', status: 'cancelled' },
  { id: 'booking-3', status: 'cancelled' },
  { id: 'booking-4', status: 'cancelled' }
];

test('admin booking statistics count actual total, active, and cancelled records', () => {
  assert.deepEqual(getAdminBookingStats(sampleBookings), { total: 4, active: 1, cancelled: 3 });
});

test('admin booking filters retain all rows or return only the selected status', () => {
  assert.deepEqual(filterAdminBookings(sampleBookings).map((booking) => booking.id), ['booking-1', 'booking-2', 'booking-3', 'booking-4']);
  assert.deepEqual(filterAdminBookings(sampleBookings, 'active').map((booking) => booking.id), ['booking-1']);
  assert.deepEqual(filterAdminBookings(sampleBookings, 'cancelled').map((booking) => booking.id), ['booking-2', 'booking-3', 'booking-4']);
});
