export function getAdminBookingStats(bookings = []) {
  return {
    total: bookings.length,
    active: bookings.filter((booking) => booking.status === 'active').length,
    cancelled: bookings.filter((booking) => booking.status === 'cancelled').length
  };
}

export function filterAdminBookings(bookings = [], filter = 'all') {
  if (filter === 'active' || filter === 'cancelled') {
    return bookings.filter((booking) => booking.status === filter);
  }
  return bookings;
}
