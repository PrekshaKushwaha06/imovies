export function buildBookingReport(bookings = []) {
  let active = 0;
  let cancelled = 0;
  let bookingValue = 0;
  const movieCounts = new Map();
  const dateCounts = new Map();

  for (const booking of bookings) {
    const status = booking.status || 'active';
    if (status === 'active') active += 1;
    if (status === 'cancelled') cancelled += 1;

    const amount = Number(booking.total);
    if (Number.isFinite(amount)) bookingValue += amount;

    const movie = booking.show?.movie;
    const movieId = movie?._id || movie?.id || '';
    const movieTitle = typeof movie?.title === 'string' && movie.title.trim() ? movie.title : 'Movie unavailable';
    const movieKey = movieId ? String(movieId) : `missing:${movieTitle}`;
    const movieEntry = movieCounts.get(movieKey) || { movieId: movieId ? String(movieId) : null, title: movieTitle, bookings: 0 };
    movieEntry.bookings += 1;
    movieCounts.set(movieKey, movieEntry);

    const createdAt = booking.createdAt ? new Date(booking.createdAt) : null;
    const date = createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt.toISOString().slice(0, 10) : 'Unknown date';
    dateCounts.set(date, (dateCounts.get(date) || 0) + 1);
  }

  const bookingsByDate = [...dateCounts].map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date === 'Unknown date' ? 1 : b.date === 'Unknown date' ? -1 : a.date.localeCompare(b.date));

  return {
    bookingCounts: { total: bookings.length, active, cancelled },
    mostBookedMovies: [...movieCounts.values()].sort((a, b) => b.bookings - a.bookings || a.title.localeCompare(b.title)),
    bookingsByDate,
    bookingValue,
    actualRevenue: null
  };
}
