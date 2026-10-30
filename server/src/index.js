import dns from "node:dns";
dns.setServers(["1.1.1.1", "8.8.8.8"]);
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomBytes, randomUUID } from 'node:crypto';
import { Booking as DefaultBooking, Movie as DefaultMovie, Screen as DefaultScreen, Show as DefaultShow, Theater as DefaultTheater, User as DefaultUser } from './models.js';
import { buildBookingReport } from './bookingReports.js';
import { buildDigitalTicket } from './digitalTickets.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function createApp({
  models = { Booking: DefaultBooking, Movie: DefaultMovie, Screen: DefaultScreen, Show: DefaultShow, Theater: DefaultTheater, User: DefaultUser },
  jwtSecret = process.env.JWT_SECRET,
  jwtExpiresIn = process.env.JWT_EXPIRES_IN || '7d',
  clientUrl = process.env.CLIENT_URL || 'http://localhost:5173'
} = {}) {
  const { Booking, Movie, Screen, Show, Theater, User } = models;
    const app = express();
  app.use(cors({ origin: clientUrl }));
  app.use(express.json({ limit: '1mb' }));
  const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
  const safeUser = (user) => ({ id: user._id, name: user.name, email: user.email, role: user.role });
  const tokenFor = (user) => jwt.sign({ sub: user._id.toString(), role: user.role }, jwtSecret, { expiresIn: jwtExpiresIn });
  const auth = asyncRoute(async (req, res, next) => {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) return res.status(401).json({ message: 'Please sign in to continue.' });
    try {
      const payload = jwt.verify(header.slice(7), jwtSecret);
      req.user = await User.findById(payload.sub).select('-passwordHash');
      if (!req.user) return res.status(401).json({ message: 'Account not found.' });
      next();
    } catch { return res.status(401).json({ message: 'Your session has expired. Please sign in again.' }); }
  });
  const admin = (req, res, next) => req.user?.role === 'admin' ? next() : res.status(403).json({ message: 'Administrator access required.' });
  const customer = (req, res, next) => req.user?.role === 'customer' ? next() : res.status(403).json({ message: 'Customer access is required for a watchlist.' });
  const seatsForShow = (capacity = 60) => Array.from({ length: capacity }, (_, i) => ({ number: `${String.fromCharCode(65 + Math.floor(i / 10))}${(i % 10) + 1}`, booked: false }));
  const validName = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max;
  const parseDateOnly = (value) => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
  };
  const validTime = (value) => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  const showStart = (date, time) => {
    const day = new Date(date);
    if (Number.isNaN(day.getTime()) || !validTime(time)) return null;
    const [hours, minutes] = time.split(':').map(Number);
    return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes);
  };
  const activeBooking = { $or: [{ status: 'active' }, { status: { $exists: false } }] };
  const showInput = (body) => {
    const date = parseDateOnly(body.date);
    const price = Number(body.price);
    return date && validTime(body.time) && Number.isFinite(price) && price >= 0
      ? { date, time: body.time, price }
      : null;
  };
  const resolveShowReferences = async (body) => {
    if (![body.movie, body.theater, body.screen].every(mongoose.isValidObjectId)) return { error: 'Select a valid movie, theater, and screen.' };
    const [movie, theater, screen] = await Promise.all([
      Movie.findById(body.movie), Theater.findById(body.theater), Screen.findOne({ _id: body.screen, theater: body.theater })
    ]);
    if (!movie) return { error: 'Choose a valid movie.' };
    if (!theater) return { error: 'Choose a valid theater.' };
    if (!screen) return { error: 'The selected screen does not belong to that theater.' };
    return { movie, theater, screen };
  };
  const hasScheduleConflict = async ({ screenId, date, time, duration, excludeId }) => {
    const start = showStart(date, time);
    if (!start) return true;
    const query = { screen: screenId };
    if (excludeId) query._id = { $ne: excludeId };
    const existing = await Show.find(query).populate({ path: 'movie', select: 'duration' });
    const end = start.getTime() + duration * 60_000;
    return existing.some((show) => {
      const otherStart = showStart(show.date, show.time);
      const otherDuration = Number(show.movie?.duration) || 0;
      if (!otherStart || otherDuration <= 0) return false;
      const otherEnd = otherStart.getTime() + otherDuration * 60_000;
      return start.getTime() < otherEnd && otherStart.getTime() < end;
    });
  };
  const withModelLocks = async (Model, ids, work) => {
    const acquired = [];
    try {
      for (const id of [...new Set(ids.filter(Boolean).map(String))].sort()) {
        const token = randomUUID();
        const now = new Date();
        const lock = await Model.findOneAndUpdate(
          { _id: id, $or: [{ scheduleLockUntil: { $exists: false } }, { scheduleLockUntil: null }, { scheduleLockUntil: { $lte: now } }] },
          { $set: { scheduleLockToken: token, scheduleLockUntil: new Date(now.getTime() + 120_000) } },
          { new: true }
        );
        if (!lock) return { locked: false };
        acquired.push({ id, token });
      }
      return { locked: true, value: await work() };
    } finally {
      await Promise.all(acquired.map(({ id, token }) => Model.updateOne(
        { _id: id, scheduleLockToken: token }, { $unset: { scheduleLockToken: 1, scheduleLockUntil: 1 } }
      ).catch(() => {})));
    }
  };
  const withScreenScheduleLocks = (screenIds, work) => withModelLocks(Screen, screenIds, work);
  const withTheaterLocks = (theaterIds, work) => withModelLocks(Theater, theaterIds, work);

  app.get('/api/health', (req, res) => res.json({ status: 'ok', database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' }));
  app.get('/api/movies', asyncRoute(async (req, res) => {
    const filter = req.query.search ? { title: { $regex: String(req.query.search).slice(0, 80), $options: 'i' } } : {};
    if (req.query.genre && req.query.genre !== 'All') filter.genre = req.query.genre;
    res.json(await Movie.find(filter).sort({ featured: -1, createdAt: -1 }));
  }));
  app.get('/api/movies/:id', asyncRoute(async (req, res) => {
    const movie = await Movie.findById(req.params.id);
    if (!movie) return res.status(404).json({ message: 'Movie not found.' });
    const shows = await Show.find({ movie: movie._id, date: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) } }).populate('theater', 'name location').populate('screen', 'name').sort({ date: 1, time: 1 });
    res.json({ movie, shows });
  }));
  app.post('/api/auth/register', asyncRoute(async (req, res) => {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (name.length < 2 || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8) return res.status(400).json({ message: 'Enter a name, valid email, and password of at least 8 characters.' });
    if (await User.exists({ email })) return res.status(409).json({ message: 'An account with this email already exists.' });
    const user = await User.create({ name, email, passwordHash: await bcrypt.hash(password, 12) });
    res.status(201).json({ token: tokenFor(user), user: safeUser(user) });
  }));
  app.post('/api/auth/login', asyncRoute(async (req, res) => {
    const user = await User.findOne({ email: String(req.body.email || '').trim().toLowerCase() });
    if (!user || !await bcrypt.compare(String(req.body.password || ''), user.passwordHash)) return res.status(401).json({ message: 'Email or password is incorrect.' });
    res.json({ token: tokenFor(user), user: safeUser(user) });
  }));
  app.get('/api/auth/me', auth, (req, res) => res.json({ user: safeUser(req.user) }));
  app.get('/api/profile', auth, customer, asyncRoute(async (req, res) => {
    res.json({ user: safeUser(req.user) });
  }));
  app.put('/api/profile', auth, customer, asyncRoute(async (req, res) => {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) return res.status(400).json({ message: 'Submit a valid profile update.' });
    const unsupported = Object.keys(body).filter((field) => field !== 'name');
    if (unsupported.length) return res.status(400).json({ message: 'Only your name can be updated. Email and account permissions cannot be changed here.' });
    if (!validName(body.name, 80) || body.name.trim().length < 2) return res.status(400).json({ message: 'Enter a name between 2 and 80 characters.' });
    const user = await User.findByIdAndUpdate(req.user._id, { $set: { name: body.name.trim() } }, { new: true, runValidators: true });
    if (!user) return res.status(404).json({ message: 'Account not found.' });
    res.json({ user: safeUser(user) });
  }));
  app.post('/api/profile/password', auth, customer, asyncRoute(async (req, res) => {
    const currentPassword = typeof req.body.currentPassword === 'string' ? req.body.currentPassword : '';
    const newPassword = typeof req.body.newPassword === 'string' ? req.body.newPassword : '';
    if (!currentPassword) return res.status(400).json({ message: 'Enter your current password.' });
    if (newPassword.length < 8 || Buffer.byteLength(newPassword, 'utf8') > 72) return res.status(400).json({ message: 'Your new password must be at least 8 characters and no more than 72 UTF-8 bytes.' });
    const account = await User.findById(req.user._id).select('+passwordHash');
    if (!account) return res.status(404).json({ message: 'Account not found.' });
    if (!await bcrypt.compare(currentPassword, account.passwordHash)) return res.status(400).json({ message: 'Your current password is incorrect.' });
    const passwordHash = await bcrypt.hash(newPassword, 12);
    const updated = await User.findByIdAndUpdate(req.user._id, { $set: { passwordHash } }, { runValidators: true });
    if (!updated) return res.status(404).json({ message: 'Account not found.' });
    res.json({ message: 'Password updated successfully.' });
  }));
  app.get('/api/watchlist', auth, customer, asyncRoute(async (req, res) => {
    const account = await User.findById(req.user._id).select('watchlist');
    if (!account) return res.status(404).json({ message: 'Account not found.' });
    const movieIds = account.watchlist || [];
    if (!movieIds.length) return res.json([]);
    res.json(await Movie.find({ _id: { $in: movieIds } }).sort({ title: 1 }));
  }));
  app.post('/api/watchlist/:movieId', auth, customer, asyncRoute(async (req, res) => {
    const { movieId } = req.params;
    if (!mongoose.isValidObjectId(movieId)) return res.status(400).json({ message: 'Invalid movie ID.' });
    const movie = await Movie.findById(movieId);
    if (!movie) return res.status(404).json({ message: 'Movie not found.' });
    const account = await User.findByIdAndUpdate(req.user._id, { $addToSet: { watchlist: movie._id } }, { new: true });
    if (!account) return res.status(404).json({ message: 'Account not found.' });
    res.json(movie);
  }));
  app.delete('/api/watchlist/:movieId', auth, customer, asyncRoute(async (req, res) => {
    const { movieId } = req.params;
    if (!mongoose.isValidObjectId(movieId)) return res.status(400).json({ message: 'Invalid movie ID.' });
    const account = await User.findByIdAndUpdate(req.user._id, { $pull: { watchlist: movieId } }, { new: true });
    if (!account) return res.status(404).json({ message: 'Account not found.' });
    res.json({ message: 'Movie removed from your watchlist.', movieId });
  }));
  app.get('/api/bookings/mine', auth, asyncRoute(async (req, res) => {
    const bookings = await Booking.find({ user: req.user._id }).populate({ path: 'show', populate: { path: 'movie' } }).sort({ createdAt: -1 });
    res.json(bookings.map((booking) => {
      const row = typeof booking.toObject === 'function' ? booking.toObject() : booking;
      const status = booking.status || 'active';
      const startsAt = booking.show ? showStart(booking.show.date, booking.show.time) : null;
      return { ...row, status, canCancel: status === 'cancelling' || (status === 'active' && Boolean(startsAt && startsAt.getTime() > Date.now())) };
    }));
  }));
  app.get('/api/bookings/:id/ticket', auth, asyncRoute(async (req, res) => {
    const bookingId = req.params.id;
    if (!mongoose.isValidObjectId(bookingId)) return res.status(400).json({ message: 'Invalid booking ID.' });
    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ message: 'Booking not found.' });
    if (req.user.role !== 'admin' && String(booking.user?._id || booking.user) !== String(req.user._id)) {
      return res.status(403).json({ message: 'You can only view tickets for your own bookings.' });
    }
    if (typeof booking.populate === 'function') {
      await booking.populate({
        path: 'show',
        populate: [
          { path: 'movie', select: 'title posterUrl' },
          { path: 'theater', select: 'name' },
          { path: 'screen', select: 'name' }
        ]
      });
    }
    res.json(buildDigitalTicket(booking));
  }));
  app.post('/api/bookings', auth, asyncRoute(async (req, res) => {
    const showId = String(req.body.showId || '');
    const seats = Array.isArray(req.body.seats) ? [...new Set(req.body.seats.map((seat) => String(seat)))] : [];
    if (!mongoose.isValidObjectId(showId) || seats.length < 1 || seats.length > 8) return res.status(400).json({ message: 'Choose between 1 and 8 seats.' });
    const scheduledShow = await Show.findById(showId);
    if (!scheduledShow) return res.status(404).json({ message: 'Show not found.' });
    const scheduledStart = showStart(scheduledShow.date, scheduledShow.time);
    if (!scheduledStart || scheduledStart.getTime() <= Date.now()) return res.status(409).json({ message: 'This show has already started and is no longer available for booking.' });
    if (await Booking.exists({ show: showId, seats: { $in: seats }, status: 'cancelling' })) return res.status(409).json({ message: 'A cancellation for one of these seats is still being completed. Please try again shortly.' });
    const bookingId = new mongoose.Types.ObjectId();
    const show = await Show.findOneAndUpdate(
      { _id: showId, seats: { $all: seats.map((number) => ({ $elemMatch: { number, booked: false } })) } },
      { $set: { 'seats.$[seat].booked': true, 'seats.$[seat].bookingId': bookingId } },
      { arrayFilters: [{ 'seat.number': { $in: seats }, 'seat.booked': false }], new: true }
    );
    if (!show) return res.status(409).json({ message: 'One or more seats are no longer available. Please choose again.' });
    try {
      const booking = await Booking.create({ _id: bookingId, user: req.user._id, show: show._id, seats, total: show.price * seats.length, bookingCode: `IM-${randomBytes(4).toString('hex').toUpperCase()}` });
      await booking.populate({ path: 'show', populate: { path: 'movie' } });
      res.status(201).json(booking);
    } catch (error) {
      await Show.updateOne({ _id: show._id }, { $set: { 'seats.$[seat].booked': false }, $unset: { 'seats.$[seat].bookingId': 1 } }, { arrayFilters: [{ 'seat.number': { $in: seats }, 'seat.bookingId': bookingId }] });
      throw error;
    }
  }));
  const cancellationHandler = asyncRoute(async (req, res) => {
    const bookingId = req.params.id;
    if (!mongoose.isValidObjectId(bookingId)) return res.status(400).json({ message: 'Invalid booking ID.' });
    let booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ message: 'Booking not found.' });
    const isAdmin = req.adminCancellation === true || req.user.role === 'admin';
    if (!isAdmin && String(booking.user?._id || booking.user) !== String(req.user._id)) return res.status(403).json({ message: 'You can only cancel your own bookings.' });
    let status = booking.status || 'active';
    if (status === 'cancelled') return res.status(409).json({ message: 'This booking is already cancelled.' });
    if (!['active', 'cancelling'].includes(status)) return res.status(409).json({ message: 'This booking cannot be cancelled.' });
    const showId = booking.show?._id || booking.show;
    const show = await Show.findById(showId);
    if (!show) return res.status(409).json({ message: 'The show is unavailable, so its seats cannot be safely released.' });
    const startsAt = showStart(show.date, show.time);
    if (!isAdmin && status === 'active' && (!startsAt || startsAt.getTime() <= Date.now())) return res.status(409).json({ message: 'Bookings can only be cancelled before the show starts.' });

    if (status === 'active') {
      const filter = { _id: bookingId, ...activeBooking };
      if (!isAdmin) filter.user = req.user._id;
      const claimed = await Booking.findOneAndUpdate(filter, { $set: { status: 'cancelling', cancellationRequestedAt: new Date() } }, { new: true });
      if (!claimed) {
        booking = await Booking.findById(bookingId);
        if ((booking?.status || 'active') !== 'cancelling') return res.status(409).json({ message: 'This booking is no longer eligible for cancellation.' });
      }
    }

    const seatNumbers = [...new Set((booking.seats || []).map(String))];
    const currentShow = await Show.findById(showId);
    const seatRows = seatNumbers.map((number) => currentShow?.seats?.find((seat) => seat.number === number));
    if (!seatNumbers.length || seatRows.some((seat) => !seat)) return res.status(409).json({ message: 'The booked seats could not be verified; cancellation is pending and no seats were released.' });
    const isOwnedByBooking = (seat) => String(seat.bookingId?._id || seat.bookingId || '') === String(bookingId);
    const allBookedAndAvailableToClaim = seatRows.every((seat) => seat.booked && (!seat.bookingId || isOwnedByBooking(seat)));
    const hasOurSeatLock = seatRows.some(isOwnedByBooking);
    let seatsReleased = !hasOurSeatLock && seatRows.every((seat) => !seat.booked || seat.bookingId);

    if (allBookedAndAvailableToClaim) {
      const alreadyClaimed = seatRows.every(isOwnedByBooking);
      const claimResult = alreadyClaimed ? { modifiedCount: 1 } : await Show.updateOne(
        { _id: showId, seats: { $all: seatNumbers.map((number) => ({ $elemMatch: { number, booked: true, $or: [{ bookingId }, { bookingId: { $exists: false } }, { bookingId: null }] } })) } },
        { $set: { 'seats.$[seat].bookingId': bookingId } },
        { arrayFilters: [{ 'seat.number': { $in: seatNumbers }, 'seat.booked': true, $or: [{ 'seat.bookingId': bookingId }, { 'seat.bookingId': { $exists: false } }, { 'seat.bookingId': null }] }] }
      );
      if (claimResult.modifiedCount) {
        const release = await Show.updateOne(
          { _id: showId, seats: { $all: seatNumbers.map((number) => ({ $elemMatch: { number, booked: true, bookingId } })) } },
          { $set: { 'seats.$[seat].booked': false }, $unset: { 'seats.$[seat].bookingId': 1 } },
          { arrayFilters: [{ 'seat.number': { $in: seatNumbers }, 'seat.booked': true, 'seat.bookingId': bookingId }] }
        );
        seatsReleased = release.modifiedCount === 1;
        if (!seatsReleased) {
          const latestShow = await Show.findById(showId);
          const latestSeats = seatNumbers.map((number) => latestShow?.seats?.find((seat) => seat.number === number));
          seatsReleased = latestSeats.every((seat) => seat && !isOwnedByBooking(seat) && (!seat.booked || seat.bookingId));
        }
      }
    }
    if (!seatsReleased) return res.status(409).json({ message: "Cancellation is pending because the booked seats changed. Retry cancellation; no other booking's seats were released." });

    const cancelled = await Booking.findOneAndUpdate(
      { _id: bookingId, status: 'cancelling' },
      { $set: { status: 'cancelled', cancelledAt: new Date() }, $unset: { cancellationRequestedAt: 1 } },
      { new: true }
    );
    if (!cancelled) {
      booking = await Booking.findById(bookingId);
      if ((booking?.status || '') !== 'cancelled') return res.status(503).json({ message: 'Seats are released but cancellation finalization is pending. Retry cancellation to finish safely.' });
    }
    res.json({ id: bookingId, status: 'cancelled', cancelledAt: cancelled?.cancelledAt || booking.cancelledAt, seats: seatNumbers });
  });
  app.post('/api/bookings/:id/cancel', auth, cancellationHandler);
  app.post('/api/admin/bookings/:id/cancel', auth, admin, (req, res, next) => { req.adminCancellation = true; next(); }, cancellationHandler);
  app.post('/api/admin/movies', auth, admin, asyncRoute(async (req, res) => res.status(201).json(await Movie.create(req.body))));
  app.put('/api/admin/movies/:id', auth, admin, asyncRoute(async (req, res) => {
    const movie = await Movie.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!movie) return res.status(404).json({ message: 'Movie not found.' });
    res.json(movie);
  }));
  app.delete('/api/admin/movies/:id', auth, admin, asyncRoute(async (req, res) => {
    if (await Show.exists({ movie: req.params.id })) return res.status(409).json({ message: 'This movie still has shows. Remove shows without booking history before deleting it.' });
    const movie = await Movie.findByIdAndDelete(req.params.id);
    if (!movie) return res.status(404).json({ message: 'Movie not found.' });
    res.json({ message: 'Movie deleted.' });
  }));
  app.get('/api/admin/theaters', auth, admin, asyncRoute(async (req, res) => {
    res.json(await Theater.find({}).select('-scheduleLockToken -scheduleLockUntil').sort({ name: 1 }));
  }));
  app.post('/api/admin/theaters', auth, admin, asyncRoute(async (req, res) => {
    const { name, location } = req.body;
    if (!validName(name, 120) || !validName(location, 240)) return res.status(400).json({ message: 'Enter a theater name and location.' });
    res.status(201).json(await Theater.create({ name: name.trim(), location: location.trim() }));
  }));
  app.put('/api/admin/theaters/:id', auth, admin, asyncRoute(async (req, res) => {
    const { name, location } = req.body;
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid theater ID.' });
    if (!validName(name, 120) || !validName(location, 240)) return res.status(400).json({ message: 'Enter a theater name and location.' });
    const theater = await Theater.findByIdAndUpdate(req.params.id, { name: name.trim(), location: location.trim() }, { new: true, runValidators: true });
    if (!theater) return res.status(404).json({ message: 'Theater not found.' });
    res.json(theater);
  }));
  app.delete('/api/admin/theaters/:id', auth, admin, asyncRoute(async (req, res) => {
    const theaterId = req.params.id;
    if (!mongoose.isValidObjectId(theaterId)) return res.status(400).json({ message: 'Invalid theater ID.' });
    const result = await withTheaterLocks([theaterId], async () => {
      if (await Screen.exists({ theater: theaterId }) || await Show.exists({ theater: theaterId })) return { status: 409, message: 'This theater still has screens or shows. Remove those dependencies before deleting it.' };
      const theater = await Theater.findByIdAndDelete(theaterId);
      return theater ? { status: 200, message: 'Theater deleted.' } : { status: 404, message: 'Theater not found.' };
    });
    if (!result.locked) return res.status(409).json({ message: 'This theater is being updated. Please retry in a moment.' });
    res.status(result.value.status).json({ message: result.value.message });
  }));
  app.get('/api/admin/screens', auth, admin, asyncRoute(async (req, res) => {
    res.json(await Screen.find({}).select('-scheduleLockToken -scheduleLockUntil').populate({ path: 'theater', select: 'name location' }).sort({ name: 1 }));
  }));
  app.post('/api/admin/theaters/:theaterId/screens', auth, admin, asyncRoute(async (req, res) => {
    const theaterId = req.params.theaterId;
    const { name } = req.body;
    const seatCapacity = Number(req.body.seatCapacity);
    if (!mongoose.isValidObjectId(theaterId)) return res.status(400).json({ message: 'Invalid theater ID.' });
    if (!validName(name, 80) || !Number.isInteger(seatCapacity) || seatCapacity < 1 || seatCapacity > 260) return res.status(400).json({ message: 'Enter a screen name and a seat capacity from 1 to 260.' });
    const result = await withTheaterLocks([theaterId], async () => {
      if (!await Theater.exists({ _id: theaterId })) return { status: 404, data: { message: 'Theater not found.' } };
      return { status: 201, data: await Screen.create({ theater: theaterId, name: name.trim(), seatCapacity }) };
    });
    if (!result.locked) return res.status(409).json({ message: 'This theater is being updated. Please retry in a moment.' });
    res.status(result.value.status).json(result.value.data);
  }));
  app.put('/api/admin/screens/:id', auth, admin, asyncRoute(async (req, res) => {
    const screenId = req.params.id;
    const { name } = req.body;
    const theaterId = String(req.body.theater || '');
    const seatCapacity = Number(req.body.seatCapacity);
    if (!mongoose.isValidObjectId(screenId) || !mongoose.isValidObjectId(theaterId)) return res.status(400).json({ message: 'Select a valid theater and screen.' });
    if (!validName(name, 80) || !Number.isInteger(seatCapacity) || seatCapacity < 1 || seatCapacity > 260) return res.status(400).json({ message: 'Enter a screen name and a seat capacity from 1 to 260.' });
    const beforeLock = await Screen.findById(screenId);
    if (!beforeLock) return res.status(404).json({ message: 'Screen not found.' });
    const result = await withTheaterLocks([beforeLock.theater, theaterId], async () => {
      const theater = await Theater.findById(theaterId);
      if (!theater) return { locked: true, value: { status: 404, data: { message: 'Theater not found.' } } };
      const screenLock = await withScreenScheduleLocks([screenId], async () => {
        const screen = await Screen.findById(screenId);
        if (!screen || String(screen.theater) !== String(beforeLock.theater)) return { status: 409, data: { message: 'This screen changed while it was being edited. Reload and try again.' } };
        const hasShows = await Show.exists({ screen: screen._id });
        if (hasShows && (String(screen.theater) !== theaterId || Number(screen.seatCapacity) !== seatCapacity)) return { status: 409, data: { message: 'A screen with shows cannot be moved or resized. Its name can still be changed.' } };
        const updated = await Screen.findByIdAndUpdate(screenId, { theater: theaterId, name: name.trim(), seatCapacity }, { new: true, runValidators: true });
        return { status: 200, data: updated };
      });
      return screenLock.locked ? { locked: true, value: screenLock.value } : { locked: false };
    });
    if (!result.locked) return res.status(409).json({ message: 'This screen or theater is being updated. Please retry in a moment.' });
    res.status(result.value.status).json(result.value.data);
  }));
  app.delete('/api/admin/screens/:id', auth, admin, asyncRoute(async (req, res) => {
    const screenId = req.params.id;
    if (!mongoose.isValidObjectId(screenId)) return res.status(400).json({ message: 'Invalid screen ID.' });
    const result = await withScreenScheduleLocks([screenId], async () => {
      if (await Show.exists({ screen: screenId })) return { status: 409, data: { message: 'This screen is associated with shows and cannot be deleted.' } };
      const screen = await Screen.findByIdAndDelete(screenId);
      return screen ? { status: 200, data: { message: 'Screen deleted.' } } : { status: 404, data: { message: 'Screen not found.' } };
    });
    if (!result.locked) return res.status(409).json({ message: 'This screen is being scheduled. Please retry in a moment.' });
    res.status(result.value.status).json(result.value.data);
  }));
  app.get('/api/admin/bookings', auth, admin, asyncRoute(async (req, res) => {
    const bookings = await Booking.find({})
      .select('user show seats total bookingCode createdAt status cancelledAt cancellationRequestedAt')
      .populate({ path: 'user', select: 'name email' })
      .populate({ path: 'show', populate: [{ path: 'movie', select: 'title posterUrl' }, { path: 'theater', select: 'name location' }, { path: 'screen', select: 'name' }] })
      .sort({ createdAt: -1 });
    res.json(bookings.map((booking) => ({
      id: booking._id,
      bookingCode: booking.bookingCode,
      status: booking.status || 'active',
      canCancel: booking.status === 'cancelling' || (booking.status || 'active') === 'active',
      cancelledAt: booking.cancelledAt,
      customer: booking.user ? { id: booking.user._id, name: booking.user.name, email: booking.user.email } : null,
      movie: booking.show?.movie ? { id: booking.show.movie._id, title: booking.show.movie.title, posterUrl: booking.show.movie.posterUrl } : null,
      showtime: booking.show ? { id: booking.show._id, date: booking.show.date, time: booking.show.time, cinema: booking.show.cinema, theater: booking.show.theater, screen: booking.show.screen } : null,
      seats: booking.seats,
      total: booking.total,
      createdAt: booking.createdAt
    })));
  }));
  app.get('/api/admin/reports', auth, admin, asyncRoute(async (req, res) => {
    const bookings = await Booking.find({})
      .select('show total status createdAt')
      .populate({ path: 'show', select: 'movie', populate: { path: 'movie', select: 'title' } })
      .sort({ createdAt: 1 });
    res.json(buildBookingReport(bookings));
  }));
  app.get('/api/admin/shows', auth, admin, asyncRoute(async (req, res) => {
    const shows = await Show.find({}).populate('movie').populate('theater').populate('screen').sort({ date: 1, time: 1 });
    res.json(shows);
  }));
  app.post('/api/admin/shows', auth, admin, asyncRoute(async (req, res) => {
    const values = showInput(req.body);
    if (!values) return res.status(400).json({ message: 'Choose a valid date, 24-hour start time, and non-negative ticket price.' });
    if (![req.body.movie, req.body.theater, req.body.screen].every((id) => mongoose.isValidObjectId(id))) return res.status(400).json({ message: 'Select a valid movie, theater, and screen.' });
    const lockResult = await withScreenScheduleLocks([req.body.screen], async () => {
      const refs = await resolveShowReferences(req.body);
      if (refs.error) return { status: 400, message: refs.error };
      const startsAt = showStart(values.date, values.time);
      if (startsAt <= new Date()) return { status: 400, message: 'A new show must start in the future.' };
      if (await hasScheduleConflict({ screenId: refs.screen._id, date: values.date, time: values.time, duration: refs.movie.duration })) return { status: 409, message: 'This show overlaps another show scheduled on the selected screen.' };
      const show = await Show.create({
        movie: refs.movie._id, theater: refs.theater._id, screen: refs.screen._id,
        cinema: `${refs.theater.name} · ${refs.theater.location}`,
        ...values, seats: seatsForShow(refs.screen.seatCapacity)
      });
      return { status: 201, data: show };
    });
    if (!lockResult.locked) return res.status(409).json({ message: 'This screen is being scheduled. Please retry in a moment.' });
    res.status(lockResult.value.status).json(lockResult.value.data || { message: lockResult.value.message });
  }));
  app.put('/api/admin/shows/:id', auth, admin, asyncRoute(async (req, res) => {
    const showId = req.params.id;
    if (!mongoose.isValidObjectId(showId)) return res.status(400).json({ message: 'Invalid show ID.' });
    const values = showInput(req.body);
    if (!values) return res.status(400).json({ message: 'Choose a valid date, 24-hour start time, and non-negative ticket price.' });
    if (![req.body.movie, req.body.theater, req.body.screen].every((id) => mongoose.isValidObjectId(id))) return res.status(400).json({ message: 'Select a valid movie, theater, and screen.' });
    const beforeLock = await Show.findById(showId);
    if (!beforeLock) return res.status(404).json({ message: 'Show not found.' });
    const sourceScreen = beforeLock.screen;
    const lockResult = await withScreenScheduleLocks([sourceScreen, req.body.screen], async () => {
      const current = await Show.findById(showId);
      if (!current || String(current.screen || '') !== String(sourceScreen || '')) return { status: 409, message: 'This show changed while it was being edited. Reload and try again.' };
      const refs = await resolveShowReferences(req.body);
      if (refs.error) return { status: 400, message: refs.error };
      const scheduleChanged = String(current.movie) !== String(refs.movie._id)
        || String(current.theater || '') !== String(refs.theater._id)
        || String(current.screen || '') !== String(refs.screen._id)
        || new Date(current.date).toISOString().slice(0, 10) !== values.date.toISOString().slice(0, 10)
        || current.time !== values.time;
      const hasBookings = await Booking.exists({ show: showId });
      if (scheduleChanged && (hasBookings || (current.seats || []).some((seat) => seat.booked))) return { status: 409, message: 'A show with booking history or reserved seats cannot be moved or rescheduled. Its ticket price may still be changed.' };
      const startsAt = showStart(values.date, values.time);
      if (scheduleChanged && startsAt <= new Date()) return { status: 400, message: 'A rescheduled show must start in the future.' };
      if (await hasScheduleConflict({ screenId: refs.screen._id, date: values.date, time: values.time, duration: refs.movie.duration, excludeId: showId })) return { status: 409, message: 'This show overlaps another show scheduled on the selected screen.' };
      const update = {
        movie: refs.movie._id, theater: refs.theater._id, screen: refs.screen._id,
        cinema: `${refs.theater.name} · ${refs.theater.location}`,
        ...values
      };
      if (scheduleChanged) update.seats = seatsForShow(refs.screen.seatCapacity);
      const updated = await Show.findByIdAndUpdate(showId, update, { new: true, runValidators: true });
      return updated ? { status: 200, data: updated } : { status: 404, message: 'Show not found.' };
    });
    if (!lockResult.locked) return res.status(409).json({ message: 'This screen is being scheduled. Please retry in a moment.' });
    res.status(lockResult.value.status).json(lockResult.value.data || { message: lockResult.value.message });
  }));
  app.delete('/api/admin/shows/:id', auth, admin, asyncRoute(async (req, res) => {
    const showId = req.params.id;
    if (!mongoose.isValidObjectId(showId)) return res.status(400).json({ message: 'Invalid show ID.' });
    if (await Booking.exists({ show: showId })) return res.status(409).json({ message: 'This show has booking history and cannot be deleted. Cancel eligible bookings to release seats; keep the show record for history.' });
    const show = await Show.findOneAndDelete({ _id: showId, 'seats.booked': { $ne: true } });
    if (!show) {
      const exists = await Show.exists({ _id: showId });
      return exists ? res.status(409).json({ message: 'This show still has reserved seats and cannot be deleted.' }) : res.status(404).json({ message: 'Show not found.' });
    }
    res.json({ message: 'Show deleted.' });
  }));


  app.use((req, res) => res.status(404).json({ message: 'Route not found.' }));
  app.use((error, req, res, next) => {
    if (mongoose.connection.readyState !== 1) return res.status(503).json({ message: 'Database connection is unavailable. Please try again when the service reconnects.' });
    console.error(error);
    if (error?.code === 11000) return res.status(409).json({ message: 'That record already exists.' });
    if (error?.name === 'ValidationError' || error?.name === 'CastError') return res.status(400).json({ message: error.message });
    res.status(500).json({ message: 'Something went wrong. Please try again.' });
  });
  return app;
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  const port = Number(process.env.PORT) || 5000;
  if (!process.env.JWT_SECRET) {
    console.error('Missing JWT_SECRET. Copy server/.env.example to server/.env and configure it.');
    process.exit(1);
  }
  mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/imovies')
    .then(() => createApp().listen(port, () => console.log(`IMovies API ready at http://localhost:${port}`)))
    .catch((error) => { console.error('MongoDB connection failed:', error.message); process.exit(1); });
}
