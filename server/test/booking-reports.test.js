import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBookingReport } from '../src/bookingReports.js';

test('booking reports count stored statuses, movie bookings, dates, and booking value', () => {
  const report = buildBookingReport([
    { status: 'active', total: 14.5, createdAt: '2026-10-01T09:00:00.000Z', show: { movie: { _id: 'movie-a', title: 'A Film' } } },
    { status: 'cancelled', total: 14.5, createdAt: '2026-10-01T13:00:00.000Z', show: { movie: { _id: 'movie-a', title: 'A Film' } } },
    { status: 'cancelled', total: 20, createdAt: '2026-10-02T10:00:00.000Z', show: { movie: { _id: 'movie-b', title: 'B Film' } } },
    { status: 'cancelled', total: 8, createdAt: '2026-10-02T11:00:00.000Z', show: { movie: { _id: 'movie-a', title: 'A Film' } } }
  ]);

  assert.deepEqual(report.bookingCounts, { total: 4, active: 1, cancelled: 3 });
  assert.deepEqual(report.mostBookedMovies, [
    { movieId: 'movie-a', title: 'A Film', bookings: 3 },
    { movieId: 'movie-b', title: 'B Film', bookings: 1 }
  ]);
  assert.deepEqual(report.bookingsByDate, [{ date: '2026-10-01', count: 2 }, { date: '2026-10-02', count: 2 }]);
  assert.equal(report.bookingValue, 57);
  assert.equal(report.actualRevenue, null);
});

test('reports tolerate absent show, movie, timestamp, and amount fields', () => {
  const report = buildBookingReport([
    { status: 'cancelled', total: 'invalid', createdAt: 'not-a-date', show: null },
    { total: 3, createdAt: null }
  ]);

  assert.deepEqual(report.bookingCounts, { total: 2, active: 1, cancelled: 1 });
  assert.deepEqual(report.mostBookedMovies, [{ movieId: null, title: 'Movie unavailable', bookings: 2 }]);
  assert.deepEqual(report.bookingsByDate, [{ date: 'Unknown date', count: 2 }]);
  assert.equal(report.bookingValue, 3);
});
