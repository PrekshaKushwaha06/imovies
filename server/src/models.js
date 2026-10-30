import mongoose from 'mongoose';

const { Schema, model } = mongoose;
const movieSchema = new Schema({
  title: { type: String, required: true, trim: true },
  synopsis: { type: String, required: true },
  posterUrl: { type: String, required: true },
  backdropUrl: String,
  genre: { type: String, required: true },
  duration: { type: Number, required: true, min: 1 },
  rating: { type: String, default: 'PG-13' },
  releaseDate: Date,
  language: { type: String, default: 'English' },
  featured: { type: Boolean, default: false }
}, { timestamps: true });
const theaterSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  location: { type: String, required: true, trim: true, maxlength: 240 },
  scheduleLockToken: String,
  scheduleLockUntil: Date
}, { timestamps: true });
const screenSchema = new Schema({
  theater: { type: Schema.Types.ObjectId, ref: 'Theater', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 80 },
  seatCapacity: { type: Number, required: true, min: 1, max: 260 },
  scheduleLockToken: String,
  scheduleLockUntil: Date
}, { timestamps: true });
screenSchema.index({ theater: 1, name: 1 }, { unique: true });
const seatSchema = new Schema({
  number: { type: String, required: true },
  booked: { type: Boolean, default: false },
  bookingId: { type: Schema.Types.ObjectId, ref: 'Booking' }
}, { _id: false });
const showSchema = new Schema({
  movie: { type: Schema.Types.ObjectId, ref: 'Movie', required: true },
  theater: { type: Schema.Types.ObjectId, ref: 'Theater' },
  screen: { type: Schema.Types.ObjectId, ref: 'Screen' },
  cinema: { type: String, required: true, default: 'IMovies Downtown' },
  date: { type: Date, required: true },
  time: { type: String, required: true },
  price: { type: Number, required: true, min: 0 },
  seats: [seatSchema]
}, { timestamps: true });
const userSchema = new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['customer', 'admin'], default: 'customer' },
  watchlist: [{ type: Schema.Types.ObjectId, ref: 'Movie' }]
}, { timestamps: true });
const bookingSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  show: { type: Schema.Types.ObjectId, ref: 'Show', required: true },
  seats: [{ type: String, required: true }],
  total: { type: Number, required: true },
  bookingCode: { type: String, required: true, unique: true },
  status: { type: String, enum: ['active', 'cancelling', 'cancelled'], default: 'active', index: true },
  cancellationRequestedAt: Date,
  cancelledAt: Date
}, { timestamps: true });

export const Movie = mongoose.models.Movie || model('Movie', movieSchema);
export const Theater = mongoose.models.Theater || model('Theater', theaterSchema);
export const Screen = mongoose.models.Screen || model('Screen', screenSchema);
export const Show = mongoose.models.Show || model('Show', showSchema);
export const User = mongoose.models.User || model('User', userSchema);
export const Booking = mongoose.models.Booking || model('Booking', bookingSchema);
