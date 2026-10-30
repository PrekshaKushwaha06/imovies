import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { createApp } from '../src/index.js';
import { User as UserModel } from '../src/models.js';
import { resolveMongoUri } from '../src/databaseConfig.js';

const JWT_SECRET_FOR_TESTS = 'test-only-imovies-jwt-secret';

test('MongoDB URI is required in production while local development keeps its fallback', () => {
  assert.throws(() => resolveMongoUri({ nodeEnv: 'production', mongoUri: '' }), /MONGODB_URI is required in production/i);
  assert.throws(() => resolveMongoUri({ nodeEnv: 'production', mongoUri: '   ' }), /MONGODB_URI is required in production/i);
  assert.equal(resolveMongoUri({ nodeEnv: 'production', mongoUri: ' mongodb+srv://configured.example/db ' }), 'mongodb+srv://configured.example/db');
  assert.equal(resolveMongoUri({ nodeEnv: 'development', mongoUri: '' }), 'mongodb://127.0.0.1:27017/imovies');
});

test('user schema defaults new accounts to customer', () => {
  const user = new UserModel({ name: 'Public User', email: 'user@example.test', passwordHash: 'hashed-password' });
  assert.equal(user.role, 'customer');
});

function makeModels() {
  const usersById = new Map();
  const usersByEmail = new Map();
  const movies = new Map();
  const theaters = new Map();
  const screens = new Map();
  const shows = new Map();
  const bookingRows = [];
  let movieCreateCalls = 0;
  let movieUpdateCalls = 0;
  let theaterCreateCalls = 0;
  let screenCreateCalls = 0;
  let showCreateCalls = 0;
  const newId = () => new mongoose.Types.ObjectId().toString();
  const same = (a, b) => String(a?._id || a) === String(b?._id || b);
  const query = (rows) => ({
    select() { return this; },
    populate() { return this; },
    sort: async () => rows,
    then(resolve, reject) { return Promise.resolve(rows).then(resolve, reject); }
  });
  const matchRefs = (row, filter) => Object.entries(filter).every(([key, value]) => {
    if (key === '_id') return typeof value === 'object' && value?.$ne ? !same(row._id, value.$ne) : same(row._id, value);
    return same(row[key], value);
  });

  const User = {
    async exists({ email }) { return usersByEmail.has(email); },
    async create({ name, email, passwordHash, role }) {
      if (usersByEmail.has(email)) { const error = new Error('duplicate email'); error.code = 11000; throw error; }
      const user = { _id: randomUUID(), name, email, passwordHash, role: role || 'customer', watchlist: [] };
      usersById.set(user._id, user); usersByEmail.set(email, user); return user;
    },
    async findOne({ email }) { return usersByEmail.get(email) || null; },
    findById(id) { return { select: async () => usersById.get(String(id)) || null }; },
    async findByIdAndUpdate(id, update) {
      const user = usersById.get(String(id));
      if (!user) return null;
      if (update.$set) Object.assign(user, update.$set);
      if (update.$addToSet?.watchlist && !user.watchlist.some((movieId) => String(movieId) === String(update.$addToSet.watchlist))) user.watchlist.push(update.$addToSet.watchlist);
      if (update.$pull?.watchlist) user.watchlist = user.watchlist.filter((movieId) => String(movieId) !== String(update.$pull.watchlist));
      return user;
    }
  };
  const Movie = {
    find(filter = {}) { return query([...movies.values()].filter((movie) => (!filter._id?.$in || filter._id.$in.some((id) => same(movie._id, id))) && (!filter.genre || movie.genre === filter.genre) && (!filter.title?.$regex || new RegExp(filter.title.$regex, filter.title.$options).test(movie.title)))); },
    async findById(id) { return movies.get(String(id)) || null; },
    async create(movie) { movieCreateCalls += 1; const row = { ...movie, _id: newId() }; movies.set(row._id, row); return row; },
    async findByIdAndUpdate(id, movie) { movieUpdateCalls += 1; const row = { ...(movies.get(String(id)) || {}), ...movie, _id: String(id) }; movies.set(row._id, row); return row; },
    async findByIdAndDelete(id) { const row = movies.get(String(id)) || null; movies.delete(String(id)); return row; }
  };
  const Theater = {
    find(filter = {}) { return query([...theaters.values()].filter((row) => matchRefs(row, filter)).sort((a, b) => a.name.localeCompare(b.name))); },
    async exists(filter) { return [...theaters.values()].some((row) => matchRefs(row, filter)); },
    async findById(id) { return theaters.get(String(id)) || null; },
    async create(fields) { theaterCreateCalls += 1; const row = { ...fields, _id: newId() }; theaters.set(row._id, row); return row; },
    async findByIdAndUpdate(id, fields) { const row = theaters.get(String(id)); if (!row) return null; Object.assign(row, fields); return row; },
    async findByIdAndDelete(id) { const row = theaters.get(String(id)) || null; theaters.delete(String(id)); return row; },
    async findOneAndUpdate(filter, update) {
      const row = theaters.get(String(filter._id));
      if (!row) return null;
      const lockUntil = row.scheduleLockUntil ? new Date(row.scheduleLockUntil) : null;
      if (lockUntil && lockUntil > new Date()) return null;
      Object.assign(row, update.$set || {}); return row;
    },
    async updateOne(filter, update) {
      const row = theaters.get(String(filter._id));
      if (!row || row.scheduleLockToken !== filter.scheduleLockToken) return { modifiedCount: 0 };
      delete row.scheduleLockToken; delete row.scheduleLockUntil; return { modifiedCount: 1 };
    }
  };
  const Screen = {
    find(filter = {}) { return query([...screens.values()].filter((row) => matchRefs(row, filter)).sort((a, b) => a.name.localeCompare(b.name)).map((row) => ({ ...row, theater: theaters.get(String(row.theater)) || row.theater }))); },
    async findOne(filter = {}) { return [...screens.values()].find((row) => matchRefs(row, filter)) || null; },
    async exists(filter) { return [...screens.values()].some((row) => matchRefs(row, filter)); },
    async findById(id) { return screens.get(String(id)) || null; },
    async create(fields) { screenCreateCalls += 1; const row = { ...fields, _id: newId() }; screens.set(row._id, row); return row; },
    async findByIdAndUpdate(id, fields) { const row = screens.get(String(id)); if (!row) return null; Object.assign(row, fields); return row; },
    async findByIdAndDelete(id) { const row = screens.get(String(id)) || null; screens.delete(String(id)); return row; },
    async findOneAndUpdate(filter, update) {
      const row = screens.get(String(filter._id));
      if (!row) return null;
      const lockUntil = row.scheduleLockUntil ? new Date(row.scheduleLockUntil) : null;
      if (lockUntil && lockUntil > new Date()) return null;
      Object.assign(row, update.$set || {}); return row;
    },
    async updateOne(filter, update) {
      const row = screens.get(String(filter._id));
      if (!row || row.scheduleLockToken !== filter.scheduleLockToken) return { modifiedCount: 0 };
      delete row.scheduleLockToken; delete row.scheduleLockUntil; return { modifiedCount: 1 };
    }
  };
  const Show = {
    find(filter = {}) {
      const rows = [...shows.values()].filter((row) => {
        if (filter.movie && !same(row.movie, filter.movie)) return false;
        if (filter.screen && !same(row.screen, filter.screen)) return false;
        if (filter._id?.$ne && same(row._id, filter._id.$ne)) return false;
        return true;
      }).map((row) => ({ ...row, movie: movies.get(String(row.movie)) || row.movie, theater: theaters.get(String(row.theater)) || row.theater, screen: screens.get(String(row.screen)) || row.screen }));
      return query(rows);
    },
    async exists(filter) { return [...shows.values()].some((row) => matchRefs(row, filter)); },
    async findById(id) { return shows.get(String(id)) || null; },
    async findOne(filter = {}) { return [...shows.values()].find((row) => matchRefs(row, filter)) || null; },
    async create(fields) { showCreateCalls += 1; const row = { ...fields, _id: newId() }; shows.set(row._id, row); return row; },
    async findByIdAndUpdate(id, fields) { const row = shows.get(String(id)); if (!row) return null; Object.assign(row, fields); return row; },
    async findOneAndUpdate(filter, update, options = {}) {
      const row = shows.get(String(filter._id)); if (!row) return null;
      const required = (filter.seats?.$all || []).map((entry) => entry.$elemMatch);
      if (!required.every((condition) => row.seats.some((seat) => seat.number === condition.number && seat.booked === condition.booked))) return null;
      const target = new Set(required.map((item) => item.number));
      row.seats.forEach((seat) => {
        if (!target.has(seat.number) || seat.booked) return;
        for (const [path, value] of Object.entries(update.$set || {})) seat[path.split('.').at(-1)] = value;
      });
      return options.new ? row : row;
    },
    async updateOne(filter, update, options = {}) {
      const row = shows.get(String(filter._id)); if (!row) return { modifiedCount: 0 };
      const conditions = (filter.seats?.$all || []).map((entry) => entry.$elemMatch);
      const satisfies = conditions.every((condition) => row.seats.some((seat) => {
        if (seat.number !== condition.number || (condition.booked !== undefined && seat.booked !== condition.booked)) return false;
        if (condition.bookingId && !same(seat.bookingId, condition.bookingId)) return false;
        if (condition.$or && !condition.$or.some((option) => option.bookingId ? same(seat.bookingId, option.bookingId) : option.bookingId?.$exists === false ? !seat.bookingId : option.bookingId === null ? !seat.bookingId : false)) return false;
        return true;
      }));
      if (!satisfies) return { modifiedCount: 0 };
      const arrayFilter = options.arrayFilters?.[0] || {};
      const numbers = new Set(arrayFilter['seat.number']?.$in || []);
      let changed = false;
      for (const seat of row.seats) {
        if (!numbers.has(seat.number)) continue;
        if (arrayFilter['seat.booked'] !== undefined && seat.booked !== arrayFilter['seat.booked']) continue;
        if (arrayFilter['seat.bookingId'] && !same(seat.bookingId, arrayFilter['seat.bookingId'])) continue;
        if (arrayFilter.$or && !arrayFilter.$or.some((option) => option['seat.bookingId'] ? same(seat.bookingId, option['seat.bookingId']) : option['seat.bookingId']?.$exists === false ? !seat.bookingId : option['seat.bookingId'] === null ? !seat.bookingId : false)) continue;
        for (const [path, value] of Object.entries(update.$set || {})) {
          if (path.startsWith('seats.$[seat].')) { const key = path.split('.').at(-1); if (seat[key] !== value) { seat[key] = value; changed = true; } }
        }
        for (const path of Object.keys(update.$unset || {})) {
          if (path.startsWith('seats.$[seat].')) { const key = path.split('.').at(-1); if (key in seat) { delete seat[key]; changed = true; } }
        }
      }
      return { modifiedCount: changed ? 1 : 0 };
    },
    async findOneAndDelete(filter = {}) {
      const row = shows.get(String(filter._id)); if (!row || row.seats.some((seat) => seat.booked)) return null;
      shows.delete(String(filter._id)); return row;
    }
  };
  const Booking = {
    find(filter = {}) {
      const rows = bookingRows.filter((row) => !filter.user || same(row.user, filter.user));
      return query(rows);
    },
    async exists(filter = {}) {
      return bookingRows.some((row) => {
        if (filter.show && !same(row.show, filter.show)) return false;
        if (filter.user && !same(row.user, filter.user)) return false;
        if (filter.status && row.status !== filter.status) return false;
        if (filter.seats?.$in && !row.seats.some((seat) => filter.seats.$in.includes(seat))) return false;
        return true;
      });
    },
    async create(fields) {
      const row = { ...fields, _id: fields._id || newId(), status: fields.status || 'active', createdAt: new Date() };
      row.populate = async () => {
        const showId = row.show?._id || row.show;
        const show = shows.get(String(showId));
        if (show) row.show = {
          ...show,
          movie: movies.get(String(show.movie)) || null,
          theater: theaters.get(String(show.theater)) || null,
          screen: screens.get(String(show.screen)) || null
        };
        return row;
      };
      bookingRows.push(row); return row;
    },
    async findById(id) { return bookingRows.find((row) => same(row._id, id)) || null; },
    async findOneAndUpdate(filter, update) {
      const statusMatches = (item) => filter.status ? item.status === filter.status : !filter.$or || filter.$or.some((condition) => condition.status === item.status || (condition.status?.$exists === false && item.status === undefined));
      const row = bookingRows.find((item) => same(item._id, filter._id) && statusMatches(item) && (!filter.user || same(item.user, filter.user)));
      if (!row) return null;
      Object.assign(row, update.$set || {}); return row;
    },
    async updateOne(filter, update) {
      const row = bookingRows.find((item) => same(item._id, filter._id) && (!filter.status || item.status === filter.status));
      if (!row) return { modifiedCount: 0 };
      Object.assign(row, update.$set || {});
      for (const key of Object.keys(update.$unset || {})) delete row[key];
      return { modifiedCount: 1 };
    }
  };

  return {
    models: { User, Movie, Theater, Screen, Show, Booking }, bookingRows,
    get movieCreateCalls() { return movieCreateCalls; }, get movieUpdateCalls() { return movieUpdateCalls; },
    get theaterCreateCalls() { return theaterCreateCalls; }, get screenCreateCalls() { return screenCreateCalls; }, get showCreateCalls() { return showCreateCalls; },
    records: { movies, theaters, screens, shows }, newId,
    async createAccount({ name = 'Test Admin', email = 'admin@example.test', password = 'AdminPassword123!', role = 'admin' } = {}) {
      const user = { _id: randomUUID(), name, email, role, watchlist: [], passwordHash: await bcrypt.hash(password, 4) };
      usersById.set(user._id, user); usersByEmail.set(email, user); return user;
    },
    async createMovie({ title = 'Test Film', duration = 120 } = {}) {
      const row = { _id: newId(), title, duration, genre: 'Drama', synopsis: 'Test synopsis', posterUrl: '/poster.jpg' };
      movies.set(row._id, row); return row;
    }
  };
}
async function startApi() {
  const fixture = makeModels();
  const server = createApp({ models: fixture.models, jwtSecret: JWT_SECRET_FOR_TESTS }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  return {
    fixture,
    baseUrl: `http://127.0.0.1:${address.port}`,
    async close() { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
  };
}

async function call(api, path, { token, body, method = body ? 'POST' : 'GET' } = {}) {
  const response = await fetch(`${api.baseUrl}${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  return { response, data: await response.json() };
}

async function adminToken(api) {
  const admin = await api.fixture.createAccount({ email: `admin-${randomUUID()}@example.test` });
  const login = await call(api, '/api/auth/login', { body: { email: admin.email, password: 'AdminPassword123!' } });
  assert.equal(login.response.status, 200);
  return login.data.token;
}

async function venueAndScreen(api, token, { capacity = 20, name = 'Screen 1' } = {}) {
  const theater = await call(api, '/api/admin/theaters', { token, body: { name: 'Central Cinema', location: '100 Main Street' } });
  assert.equal(theater.response.status, 201);
  const screen = await call(api, `/api/admin/theaters/${theater.data._id}/screens`, { token, body: { name, seatCapacity: capacity } });
  assert.equal(screen.response.status, 201);
  return { theater: theater.data, screen: screen.data };
}

async function createShow(api, token, { movie, theater, screen, date = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10), time = '12:00', price = 12.5 } = {}) {
  return call(api, '/api/admin/shows', { token, body: { movie: movie._id, theater: theater._id, screen: screen._id, date, time, price } });
}

test('registration rejects invalid fields', async (t) => {
  const api = await startApi();
  t.after(() => api.close());
  const { response, data } = await call(api, '/api/auth/register', { body: { name: 'A', email: 'bad-email', password: 'short' } });
  assert.equal(response.status, 400);
  assert.match(data.message, /valid email/i);
});

test('public registration always creates a customer even if role is submitted', async (t) => {
  const api = await startApi();
  t.after(() => api.close());
  const { response, data } = await call(api, '/api/auth/register', {
    body: { name: 'Public User', email: 'PUBLIC@example.test', password: 'password123', role: 'admin' }
  });
  assert.equal(response.status, 201);
  assert.equal(data.user.role, 'customer');
  assert.equal(typeof data.token, 'string');
  assert.equal('passwordHash' in data.user, false);
});

test('registration rejects a duplicate email case-insensitively', async (t) => {
  const api = await startApi();
  t.after(() => api.close());
  const first = await call(api, '/api/auth/register', { body: { name: 'Public User', email: 'user@example.test', password: 'password123' } });
  const second = await call(api, '/api/auth/register', { body: { name: 'Other User', email: 'USER@example.test', password: 'password123' } });
  assert.equal(first.response.status, 201);
  assert.equal(second.response.status, 409);
});

test('login rejects incorrect credentials', async (t) => {
  const api = await startApi();
  t.after(() => api.close());
  await call(api, '/api/auth/register', { body: { name: 'Public User', email: 'user@example.test', password: 'password123' } });
  const { response, data } = await call(api, '/api/auth/login', { body: { email: 'user@example.test', password: 'incorrect-password' } });
  assert.equal(response.status, 401);
  assert.match(data.message, /incorrect/i);
});

test('an existing customer account can log in and receives a customer token', async (t) => {
  const api = await startApi();
  t.after(() => api.close());
  await call(api, '/api/auth/register', { body: { name: 'Returning Customer', email: 'returning-customer@example.test', password: 'password123' } });
  const { response, data } = await call(api, '/api/auth/login', { body: { email: 'RETURNING-CUSTOMER@example.test', password: 'password123' } });
  assert.equal(response.status, 200);
  assert.equal(data.user.role, 'customer');
  assert.equal(typeof data.token, 'string');
});

test('login reports a database outage instead of masking it as a generic error', async (t) => {
  const api = await startApi();
  t.after(() => api.close());
  api.fixture.models.User.findOne = async () => { throw new Error('simulated database query failure'); };
  const { response, data } = await call(api, '/api/auth/login', { body: { email: 'customer@example.test', password: 'password123' } });
  assert.equal(response.status, 503);
  assert.match(data.message, /database connection is unavailable/i);
});

test('profile endpoints deny unauthenticated access', async (t) => {
  const api = await startApi();
  t.after(() => api.close());
  assert.equal((await call(api, '/api/profile')).response.status, 401);
  assert.equal((await call(api, '/api/profile', { method: 'PUT', body: { name: 'No Session' } })).response.status, 401);
  assert.equal((await call(api, '/api/profile/password', { method: 'POST', body: { currentPassword: 'x', newPassword: 'password123' } })).response.status, 401);
});

test('customers can view and update their own safe profile but cannot change email or role', async (t) => {
  const api = await startApi();
  t.after(() => api.close());
  const registration = await call(api, '/api/auth/register', { body: { name: 'Profile Customer', email: 'profile-customer@example.test', password: 'password123' } });
  const profile = await call(api, '/api/profile', { token: registration.data.token });
  assert.equal(profile.response.status, 200);
  assert.deepEqual(profile.data.user, { id: registration.data.user.id, name: 'Profile Customer', email: 'profile-customer@example.test', role: 'customer' });
  assert.equal(JSON.stringify(profile.data).includes('passwordHash'), false);

  const updated = await call(api, '/api/profile', { token: registration.data.token, method: 'PUT', body: { name: '  New Customer Name  ' } });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.data.user.name, 'New Customer Name');
  assert.equal(updated.data.user.email, 'profile-customer@example.test');
  assert.equal(updated.data.user.role, 'customer');
  assert.equal(JSON.stringify(updated.data).includes('passwordHash'), false);

  const attemptedPrivilegeChange = await call(api, '/api/profile', { token: registration.data.token, method: 'PUT', body: { name: 'Changed Name', email: 'changed@example.test', role: 'admin' } });
  assert.equal(attemptedPrivilegeChange.response.status, 400);
  const unchanged = await call(api, '/api/profile', { token: registration.data.token });
  assert.equal(unchanged.data.user.name, 'New Customer Name');
  assert.equal(unchanged.data.user.email, 'profile-customer@example.test');
  assert.equal(unchanged.data.user.role, 'customer');
});

test('customers can change their password only after verifying the current password', async (t) => {
  const api = await startApi();
  t.after(() => api.close());
  const registration = await call(api, '/api/auth/register', { body: { name: 'Password Customer', email: 'password-customer@example.test', password: 'oldPassword123' } });
  const incorrect = await call(api, '/api/profile/password', { token: registration.data.token, method: 'POST', body: { currentPassword: 'wrongPassword', newPassword: 'newPassword456' } });
  assert.equal(incorrect.response.status, 400);
  assert.match(incorrect.data.message, /current password is incorrect/i);
  const oldLogin = await call(api, '/api/auth/login', { body: { email: 'password-customer@example.test', password: 'oldPassword123' } });
  assert.equal(oldLogin.response.status, 200);

  const changed = await call(api, '/api/profile/password', { token: registration.data.token, method: 'POST', body: { currentPassword: 'oldPassword123', newPassword: 'newPassword456' } });
  assert.equal(changed.response.status, 200);
  assert.match(changed.data.message, /updated successfully/i);
  assert.doesNotMatch(JSON.stringify(changed.data), /passwordHash|oldPassword123|newPassword456/);
  const rejectedOldLogin = await call(api, '/api/auth/login', { body: { email: 'password-customer@example.test', password: 'oldPassword123' } });
  const newLogin = await call(api, '/api/auth/login', { body: { email: 'password-customer@example.test', password: 'newPassword456' } });
  assert.equal(rejectedOldLogin.response.status, 401);
  assert.equal(newLogin.response.status, 200);
  assert.equal(newLogin.data.user.role, 'customer');
  assert.equal(JSON.stringify(newLogin.data).includes('passwordHash'), false);
});

test('admin endpoints reject unauthenticated requests', async (t) => {
  const api = await startApi();
  t.after(() => api.close());
  const movie = await call(api, '/api/admin/movies', { body: {} });
  const bookings = await call(api, '/api/admin/bookings');
  const cancellation = await call(api, '/api/admin/bookings/not-an-id/cancel', { method: 'POST' });
  assert.equal(movie.response.status, 401);
  assert.equal(bookings.response.status, 401);
  assert.equal(cancellation.response.status, 401);
});

test('watchlists require authentication and only modify the signed-in customer account', async (t) => {
  const api = await startApi();
  t.after(() => api.close());
  const first = await call(api, '/api/auth/register', { body: { name: 'Watchlist Owner', email: 'watchlist-owner@example.test', password: 'password123' } });
  const second = await call(api, '/api/auth/register', { body: { name: 'Other Customer', email: 'watchlist-other@example.test', password: 'password123' } });
  const movie = await api.fixture.createMovie();

  assert.equal((await call(api, '/api/watchlist')).response.status, 401);
  assert.equal((await call(api, `/api/watchlist/${movie._id}`, { method: 'POST' })).response.status, 401);
  assert.equal((await call(api, `/api/watchlist/${movie._id}`, { method: 'DELETE' })).response.status, 401);
  assert.equal((await call(api, '/api/watchlist', { token: await adminToken(api) })).response.status, 403);

  const saved = await call(api, `/api/watchlist/${movie._id}`, { token: first.data.token, method: 'POST' });
  const duplicate = await call(api, `/api/watchlist/${movie._id}`, { token: first.data.token, method: 'POST' });
  assert.equal(saved.response.status, 200);
  assert.equal(duplicate.response.status, 200);
  const firstList = await call(api, '/api/watchlist', { token: first.data.token });
  const otherList = await call(api, '/api/watchlist', { token: second.data.token });
  assert.deepEqual(firstList.data.map((item) => item._id), [movie._id]);
  assert.deepEqual(otherList.data, []);

  const login = await call(api, '/api/auth/login', { body: { email: 'watchlist-owner@example.test', password: 'password123' } });
  const afterLogin = await call(api, '/api/watchlist', { token: login.data.token });
  assert.deepEqual(afterLogin.data.map((item) => item._id), [movie._id]);

  const removed = await call(api, `/api/watchlist/${movie._id}`, { token: first.data.token, method: 'DELETE' });
  assert.equal(removed.response.status, 200);
  assert.deepEqual((await call(api, '/api/watchlist', { token: first.data.token })).data, []);
});

test('watchlists omit movies that have been deleted or are unavailable', async (t) => {
  const api = await startApi();
  t.after(() => api.close());
  const customer = await call(api, '/api/auth/register', { body: { name: 'Stale Watchlist', email: 'stale-watchlist@example.test', password: 'password123' } });
  const movie = await api.fixture.createMovie();
  await call(api, `/api/watchlist/${movie._id}`, { token: customer.data.token, method: 'POST' });
  api.fixture.records.movies.delete(movie._id);
  const result = await call(api, '/api/watchlist', { token: customer.data.token });
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.data, []);
});

test('customer tokens cannot create movies or view admin bookings', async (t) => {
  const api = await startApi();
  t.after(() => api.close());
  const registration = await call(api, '/api/auth/register', { body: { name: 'Customer', email: 'customer@example.test', password: 'password123' } });
  const movie = await call(api, '/api/admin/movies', { token: registration.data.token, body: {} });
  const movieUpdate = await call(api, '/api/admin/movies/movie-1', { method: 'PUT', token: registration.data.token, body: { title: 'No access' } });
  const bookings = await call(api, '/api/admin/bookings', { token: registration.data.token });
  assert.equal(movie.response.status, 403);
  assert.equal(movieUpdate.response.status, 403);
  assert.equal(bookings.response.status, 403);
  assert.equal(api.fixture.movieCreateCalls, 0);
  assert.equal(api.fixture.movieUpdateCalls, 0);
});

test('admin movie updates use the existing protected PUT endpoint', async (t) => {
  const api = await startApi();
  t.after(() => api.close());
  const admin = await api.fixture.createAccount();
  const login = await call(api, '/api/auth/login', { body: { email: admin.email, password: 'AdminPassword123!' } });
  const { response, data } = await call(api, '/api/admin/movies/movie-1', {
    method: 'PUT', token: login.data.token,
    body: { title: 'Updated Film', synopsis: 'Updated synopsis', posterUrl: '/poster.jpg', genre: 'Drama', duration: 110, rating: 'PG-13', language: 'English', featured: true }
  });
  assert.equal(response.status, 200);
  assert.equal(data.title, 'Updated Film');
  assert.equal(api.fixture.movieUpdateCalls, 1);
});

test('admins can view safe booking details without payment or password fields', async (t) => {
  const api = await startApi();
  t.after(() => api.close());
  const admin = await api.fixture.createAccount();
  api.fixture.bookingRows.push({
    _id: 'booking-1', bookingCode: 'IM-TEST1234',
    user: { _id: admin._id, name: admin.name, email: admin.email, passwordHash: admin.passwordHash },
    show: { _id: 'show-1', date: '2030-01-01', time: '19:30', cinema: 'Downtown', movie: { _id: 'movie-1', title: 'Test Film', posterUrl: '/poster.jpg' } },
    seats: ['A1', 'A2'], total: 25, createdAt: '2029-12-01T00:00:00.000Z'
  });
  const login = await call(api, '/api/auth/login', { body: { email: admin.email, password: 'AdminPassword123!' } });
  const { response, data } = await call(api, '/api/admin/bookings', { token: login.data.token });
  assert.equal(response.status, 200);
  assert.equal(data[0].customer.email, admin.email);
  assert.equal(data[0].movie.title, 'Test Film');
  assert.deepEqual(data[0].seats, ['A1', 'A2']);
  assert.equal(data[0].total, 25);
  assert.equal('paymentStatus' in data[0], false);
  assert.equal(JSON.stringify(data).includes('passwordHash'), false);
  assert.equal(JSON.stringify(data).includes(login.data.token), false);
});

test('booking reports are available only to admins and use stored booking records', async (t) => {
  const api = await startApi();
  t.after(() => api.close());
  const admin = await adminToken(api);
  const customer = await call(api, '/api/auth/register', { body: { name: 'Report Customer', email: 'report-customer@example.test', password: 'password123' } });
  api.fixture.bookingRows.push(
    { _id: 'report-1', status: 'active', total: 10, createdAt: new Date('2026-10-01T10:00:00.000Z'), show: { movie: { _id: 'movie-a', title: 'Report Film' } } },
    { _id: 'report-2', status: 'cancelled', total: 10, createdAt: new Date('2026-10-02T10:00:00.000Z'), show: { movie: { _id: 'movie-a', title: 'Report Film' } } }
  );

  assert.equal((await call(api, '/api/admin/reports')).response.status, 401);
  assert.equal((await call(api, '/api/admin/reports', { token: customer.data.token })).response.status, 403);
  const result = await call(api, '/api/admin/reports', { token: admin });
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.data.bookingCounts, { total: 2, active: 1, cancelled: 1 });
  assert.deepEqual(result.data.mostBookedMovies, [{ movieId: 'movie-a', title: 'Report Film', bookings: 2 }]);
  assert.equal(result.data.bookingValue, 20);
  assert.equal(result.data.actualRevenue, null);
});

test('theater creation validates fields and requires an administrator', async (t) => {
  const api = await startApi();
  t.after(() => api.close());
  const customer = await call(api, '/api/auth/register', { body: { name: 'Customer', email: 'theater-customer@example.test', password: 'password123' } });
  const denied = await call(api, '/api/admin/theaters', { token: customer.data.token, body: { name: 'Cinema', location: 'Town' } });
  const admin = await adminToken(api);
  const invalid = await call(api, '/api/admin/theaters', { token: admin, body: { name: ' ', location: '' } });
  const created = await call(api, '/api/admin/theaters', { token: admin, body: { name: 'Central Cinema', location: '100 Main Street' } });
  assert.equal(denied.response.status, 403);
  assert.equal(invalid.response.status, 400);
  assert.equal(created.response.status, 201);
  assert.equal(api.fixture.theaterCreateCalls, 1);
});

test('screens belong to a selected theater and invalid associations cannot schedule a show', async (t) => {
  const api = await startApi();
  t.after(() => api.close());
  const token = await adminToken(api);
  const { theater, screen } = await venueAndScreen(api, token, { capacity: 42 });
  const otherTheater = await call(api, '/api/admin/theaters', { token, body: { name: 'West Cinema', location: '200 Oak Road' } });
  const otherScreen = await call(api, `/api/admin/theaters/${otherTheater.data._id}/screens`, { token, body: { name: 'Screen A', seatCapacity: 20 } });
  const movie = await api.fixture.createMovie();
  const mismatched = await createShow(api, token, { movie, theater, screen: otherScreen.data });
  assert.equal(mismatched.response.status, 400);
  assert.match(mismatched.data.message, /belong/i);
  assert.equal(api.fixture.screenCreateCalls, 2);
  assert.equal(screen.theater, theater._id);
  assert.equal(screen.seatCapacity, 42);
});

test('show creation rejects overlaps on the same screen and allows non-overlapping times', async (t) => {
  const api = await startApi();
  t.after(() => api.close());
  const token = await adminToken(api);
  const { theater, screen } = await venueAndScreen(api, token);
  const movie = await api.fixture.createMovie({ duration: 120 });
  const date = new Date(Date.now() + 4 * 86_400_000).toISOString().slice(0, 10);
  const first = await createShow(api, token, { movie, theater, screen, date, time: '12:00' });
  const overlap = await createShow(api, token, { movie, theater, screen, date, time: '13:30' });
  const adjacent = await createShow(api, token, { movie, theater, screen, date, time: '14:00' });
  assert.equal(first.response.status, 201);
  assert.equal(first.data.seats.length, 20);
  assert.equal(overlap.response.status, 409);
  assert.match(overlap.data.message, /overlaps/i);
  assert.equal(adjacent.response.status, 201);
  assert.equal(api.fixture.showCreateCalls, 2);
});

test('concurrent overlapping show requests cannot schedule the same screen twice', async (t) => {
  const api = await startApi();
  t.after(() => api.close());
  const token = await adminToken(api);
  const { theater, screen } = await venueAndScreen(api, token);
  const movie = await api.fixture.createMovie({ duration: 120 });
  const date = new Date(Date.now() + 4 * 86_400_000).toISOString().slice(0, 10);
  const results = await Promise.all([
    createShow(api, token, { movie, theater, screen, date, time: '12:00' }),
    createShow(api, token, { movie, theater, screen, date, time: '13:00' })
  ]);
  assert.deepEqual(results.map((result) => result.response.status).sort(), [201, 409]);
  assert.equal(api.fixture.records.shows.size, 1);
});

test('show edits use PUT, and shows with booking history cannot be rescheduled or deleted', async (t) => {
  const api = await startApi();
  t.after(() => api.close());
  const token = await adminToken(api);
  const { theater, screen } = await venueAndScreen(api, token);
  const movie = await api.fixture.createMovie({ duration: 100 });
  const date = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
  const created = await createShow(api, token, { movie, theater, screen, date });
  const priceChange = await call(api, `/api/admin/shows/${created.data._id}`, { method: 'PUT', token, body: { movie: movie._id, theater: theater._id, screen: screen._id, date, time: '12:00', price: 15 } });
  assert.equal(priceChange.response.status, 200);
  assert.equal(priceChange.data.price, 15);

  const customer = await call(api, '/api/auth/register', { body: { name: 'Buyer', email: 'show-buyer@example.test', password: 'password123' } });
  const booked = await call(api, '/api/bookings', { token: customer.data.token, body: { showId: created.data._id, seats: ['A1'] } });
  assert.equal(booked.response.status, 201);
  const moved = await call(api, `/api/admin/shows/${created.data._id}`, { method: 'PUT', token, body: { movie: movie._id, theater: theater._id, screen: screen._id, date, time: '14:00', price: 15 } });
  const deleted = await call(api, `/api/admin/shows/${created.data._id}`, { method: 'DELETE', token });
  const screenDeleted = await call(api, `/api/admin/screens/${screen._id}`, { method: 'DELETE', token });
  const theaterDeleted = await call(api, `/api/admin/theaters/${theater._id}`, { method: 'DELETE', token });
  assert.equal(moved.response.status, 409);
  assert.equal(deleted.response.status, 409);
  assert.equal(screenDeleted.response.status, 409);
  assert.equal(theaterDeleted.response.status, 409);
  assert.ok(api.fixture.records.shows.has(created.data._id));
});

test('an administrator can safely delete an unused show, screen, and theater', async (t) => {
  const api = await startApi();
  t.after(() => api.close());
  const token = await adminToken(api);
  const { theater, screen } = await venueAndScreen(api, token);
  const movie = await api.fixture.createMovie();
  const created = await createShow(api, token, { movie, theater, screen });
  assert.equal((await call(api, `/api/admin/shows/${created.data._id}`, { method: 'DELETE', token })).response.status, 200);
  assert.equal((await call(api, `/api/admin/screens/${screen._id}`, { method: 'DELETE', token })).response.status, 200);
  assert.equal((await call(api, `/api/admin/theaters/${theater._id}`, { method: 'DELETE', token })).response.status, 200);
});

test('users can cancel their own bookings and seats can be rebooked only once', async (t) => {
  const api = await startApi();
  t.after(() => api.close());
  const token = await adminToken(api);
  const { theater, screen } = await venueAndScreen(api, token);
  const movie = await api.fixture.createMovie();
  const show = await createShow(api, token, { movie, theater, screen });
  const user = await call(api, '/api/auth/register', { body: { name: 'Seat Buyer', email: 'seat-buyer@example.test', password: 'password123' } });
  const initialBooking = await call(api, '/api/bookings', { token: user.data.token, body: { showId: show.data._id, seats: ['A1'] } });
  assert.equal(initialBooking.response.status, 201);
  const cancelled = await call(api, `/api/bookings/${initialBooking.data._id}/cancel`, { method: 'POST', token: user.data.token });
  assert.equal(cancelled.response.status, 200, JSON.stringify({ booking: initialBooking.data, cancelled: cancelled.data }));
  assert.equal(cancelled.data.status, 'cancelled');
  const seatAfterCancel = api.fixture.records.shows.get(show.data._id).seats.find((seat) => seat.number === 'A1');
  assert.equal(seatAfterCancel.booked, false);
  assert.equal(seatAfterCancel.bookingId, undefined);
  assert.equal(api.fixture.bookingRows[0].status, 'cancelled');

  const replacement = await call(api, '/api/bookings', { token: user.data.token, body: { showId: show.data._id, seats: ['A1'] } });
  const duplicate = await call(api, '/api/bookings', { token: user.data.token, body: { showId: show.data._id, seats: ['A1'] } });
  assert.equal(replacement.response.status, 201);
  assert.equal(duplicate.response.status, 409);
  assert.equal(api.fixture.bookingRows.filter((booking) => booking.status === 'active' && booking.seats.includes('A1')).length, 1);
});

test('customers can view their own complete digital ticket and admins can view authorized tickets', async (t) => {
  const api = await startApi();
  t.after(() => api.close());
  const admin = await adminToken(api);
  const { theater, screen } = await venueAndScreen(api, admin);
  const movie = await api.fixture.createMovie({ title: 'Ticket Feature Film' });
  const show = await createShow(api, admin, { movie, theater, screen, date: '2035-08-09', time: '18:45', price: 16 });
  const owner = await call(api, '/api/auth/register', { body: { name: 'Ticket Owner', email: 'ticket-owner@example.test', password: 'password123' } });
  const other = await call(api, '/api/auth/register', { body: { name: 'Ticket Other', email: 'ticket-other@example.test', password: 'password123' } });
  const booking = await call(api, '/api/bookings', { token: owner.data.token, body: { showId: show.data._id, seats: ['A1', 'A2'] } });

  const unauthenticated = await call(api, `/api/bookings/${booking.data._id}/ticket`);
  const ownTicket = await call(api, `/api/bookings/${booking.data._id}/ticket`, { token: owner.data.token });
  const otherTicket = await call(api, `/api/bookings/${booking.data._id}/ticket`, { token: other.data.token });
  const adminTicket = await call(api, `/api/bookings/${booking.data._id}/ticket`, { token: admin });
  assert.equal(unauthenticated.response.status, 401);
  assert.equal(otherTicket.response.status, 403);
  assert.equal(ownTicket.response.status, 200);
  assert.equal(adminTicket.response.status, 200);
  assert.equal(ownTicket.data.bookingCode, booking.data.bookingCode);
  assert.deepEqual(ownTicket.data.movie, { title: 'Ticket Feature Film', posterUrl: '/poster.jpg' });
  assert.equal(ownTicket.data.venueName, 'Central Cinema');
  assert.equal(ownTicket.data.screenName, 'Screen 1');
  assert.equal(new Date(ownTicket.data.showDate).toISOString().slice(0, 10), '2035-08-09');
  assert.equal(ownTicket.data.showTime, '18:45');
  assert.deepEqual(ownTicket.data.seats, ['A1', 'A2']);
  assert.equal(ownTicket.data.total, 32);
  assert.equal(ownTicket.data.status, 'Active');
  assert.ok(ownTicket.data.bookingDate);
  assert.equal(JSON.stringify(ownTicket.data).includes('passwordHash'), false);
});

test('digital tickets show cancelled status and safely handle missing show or movie references', async (t) => {
  const api = await startApi();
  t.after(() => api.close());
  const owner = await api.fixture.createAccount({ role: 'customer', email: 'cancelled-ticket@example.test' });
  const login = await call(api, '/api/auth/login', { body: { email: owner.email, password: 'AdminPassword123!' } });
  const { bookingRows, records, newId } = api.fixture;
  const missingMovieShowId = newId();
  records.shows.set(missingMovieShowId, {
    _id: missingMovieShowId, movie: newId(), theater: newId(), screen: newId(), cinema: 'Legacy Cinema',
    date: new Date('2035-08-10T00:00:00.000Z'), time: '20:00'
  });
  const cancelledId = newId();
  const missingShowId = newId();
  bookingRows.push({
    _id: cancelledId, user: owner._id, show: missingMovieShowId, seats: ['B3'], total: 11, bookingCode: 'IM-CANCELLED1',
    status: 'cancelled', createdAt: new Date('2035-08-01T10:00:00.000Z'),
    populate: async function () {
      const show = records.shows.get(String(this.show?._id || this.show));
      this.show = show ? { ...show, movie: null, theater: null, screen: null } : null;
      return this;
    }
  });
  const missingId = newId();
  bookingRows.push({
    _id: missingId, user: owner._id, show: missingShowId, seats: ['C4'], total: 9, bookingCode: 'IM-NOSHOW123',
    status: 'active', createdAt: new Date('2035-08-02T10:00:00.000Z'),
    populate: async function () { this.show = null; return this; }
  });

  const cancelled = await call(api, `/api/bookings/${cancelledId}/ticket`, { token: login.data.token });
  const missing = await call(api, `/api/bookings/${missingId}/ticket`, { token: login.data.token });
  assert.equal(cancelled.response.status, 200);
  assert.equal(cancelled.data.status, 'Cancelled');
  assert.equal(cancelled.data.movie, null);
  assert.equal(cancelled.data.venueName, 'Legacy Cinema');
  assert.equal(cancelled.data.screenName, null);
  assert.equal(missing.response.status, 200);
  assert.equal(missing.data.status, 'Active');
  assert.equal(missing.data.movie, null);
  assert.equal(missing.data.venueName, null);
  assert.equal(missing.data.showDate, null);
});

test('concurrent duplicate seat booking requests reserve the seat for one booking only', async (t) => {
  const api = await startApi();
  t.after(() => api.close());
  const admin = await adminToken(api);
  const { theater, screen } = await venueAndScreen(api, admin);
  const movie = await api.fixture.createMovie();
  const show = await createShow(api, admin, { movie, theater, screen });
  const user = await call(api, '/api/auth/register', { body: { name: 'Concurrent Buyer', email: 'concurrent-buyer@example.test', password: 'password123' } });
  const results = await Promise.all([
    call(api, '/api/bookings', { token: user.data.token, body: { showId: show.data._id, seats: ['A1'] } }),
    call(api, '/api/bookings', { token: user.data.token, body: { showId: show.data._id, seats: ['A1'] } })
  ]);
  assert.deepEqual(results.map((result) => result.response.status).sort(), [201, 409]);
  assert.equal(api.fixture.bookingRows.filter((booking) => booking.status === 'active' && booking.seats.includes('A1')).length, 1);
  const seat = api.fixture.records.shows.get(show.data._id).seats.find((item) => item.number === 'A1');
  assert.equal(seat.booked, true);
  assert.equal(String(seat.bookingId), String(api.fixture.bookingRows.find((booking) => booking.status === 'active')._id));
});

test('a user cannot cancel another customer’s booking', async (t) => {
  const api = await startApi();
  t.after(() => api.close());
  const admin = await adminToken(api);
  const { theater, screen } = await venueAndScreen(api, admin);
  const movie = await api.fixture.createMovie();
  const show = await createShow(api, admin, { movie, theater, screen });
  const owner = await call(api, '/api/auth/register', { body: { name: 'Owner', email: 'booking-owner@example.test', password: 'password123' } });
  const other = await call(api, '/api/auth/register', { body: { name: 'Other', email: 'other-user@example.test', password: 'password123' } });
  const booking = await call(api, '/api/bookings', { token: owner.data.token, body: { showId: show.data._id, seats: ['A2'] } });
  const result = await call(api, `/api/bookings/${booking.data._id}/cancel`, { method: 'POST', token: other.data.token });
  const adminRoute = await call(api, `/api/admin/bookings/${booking.data._id}/cancel`, { method: 'POST', token: owner.data.token });
  assert.equal(result.response.status, 403);
  assert.equal(adminRoute.response.status, 403);
  assert.equal(api.fixture.bookingRows[0].status, 'active');
  assert.equal(api.fixture.records.shows.get(show.data._id).seats.find((seat) => seat.number === 'A2').booked, true);
});

test('cancellation after show start is rejected without releasing seats', async (t) => {
  const api = await startApi();
  t.after(() => api.close());
  const admin = await adminToken(api);
  const { theater, screen } = await venueAndScreen(api, admin);
  const movie = await api.fixture.createMovie();
  const show = await createShow(api, admin, { movie, theater, screen });
  const user = await call(api, '/api/auth/register', { body: { name: 'Late Buyer', email: 'late-buyer@example.test', password: 'password123' } });
  const booking = await call(api, '/api/bookings', { token: user.data.token, body: { showId: show.data._id, seats: ['A3'] } });
  api.fixture.records.shows.get(show.data._id).date = new Date(Date.now() - 86_400_000);
  const result = await call(api, `/api/bookings/${booking.data._id}/cancel`, { method: 'POST', token: user.data.token });
  assert.equal(result.response.status, 409);
  assert.equal(api.fixture.bookingRows[0].status, 'active');
  assert.equal(api.fixture.records.shows.get(show.data._id).seats.find((seat) => seat.number === 'A3').booked, true);
});

test('admins can cancel a customer booking through the protected cancellation route', async (t) => {
  const api = await startApi();
  t.after(() => api.close());
  const admin = await adminToken(api);
  const { theater, screen } = await venueAndScreen(api, admin);
  const movie = await api.fixture.createMovie();
  const show = await createShow(api, admin, { movie, theater, screen });
  const customer = await call(api, '/api/auth/register', { body: { name: 'Admin Cancel Buyer', email: 'admin-cancel@example.test', password: 'password123' } });
  const booking = await call(api, '/api/bookings', { token: customer.data.token, body: { showId: show.data._id, seats: ['A4'] } });
  api.fixture.records.shows.get(show.data._id).date = new Date(Date.now() - 86_400_000);
  const adminList = await call(api, '/api/admin/bookings', { token: admin });
  assert.equal(adminList.data[0].canCancel, true, 'active bookings remain actionable in the admin dashboard after showtime');
  const result = await call(api, `/api/admin/bookings/${booking.data._id}/cancel`, { method: 'POST', token: admin });
  assert.equal(result.response.status, 200);
  assert.equal(api.fixture.bookingRows[0].status, 'cancelled');
  assert.equal(api.fixture.records.shows.get(show.data._id).seats.find((seat) => seat.number === 'A4').booked, false);
  const repeated = await call(api, `/api/admin/bookings/${booking.data._id}/cancel`, { method: 'POST', token: admin });
  assert.equal(repeated.response.status, 409);
  assert.match(repeated.data.message, /already cancelled/i);
});
