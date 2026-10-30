export function buildDigitalTicket(booking) {
  const show = booking?.show && typeof booking.show === 'object' ? booking.show : null;
  const movie = show?.movie && typeof show.movie === 'object' ? show.movie : null;
  const theater = show?.theater && typeof show.theater === 'object' ? show.theater : null;
  const screen = show?.screen && typeof show.screen === 'object' ? show.screen : null;
  const total = Number(booking?.total);

  return {
    bookingCode: booking?.bookingCode || null,
    movie: movie ? { title: movie.title || null, posterUrl: movie.posterUrl || null } : null,
    venueName: theater?.name || show?.cinema || null,
    screenName: screen?.name || null,
    showDate: show?.date || null,
    showTime: show?.time || null,
    seats: Array.isArray(booking?.seats) ? booking.seats : [],
    total: Number.isFinite(total) ? total : null,
    status: !booking?.status || booking.status === 'active' ? 'Active' : 'Cancelled',
    bookingDate: booking?.createdAt || null
  };
}
