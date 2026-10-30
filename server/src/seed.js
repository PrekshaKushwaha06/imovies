import dns from "node:dns";
dns.setServers(["1.1.1.1", "8.8.8.8"]);
import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { Movie, Show, User } from './models.js';

const posters = {
  'Dune: Part Two': 'https://image.tmdb.org/t/p/w780/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg',
  'The Batman': 'https://image.tmdb.org/t/p/w780/74xTEgt7R36Fpooo50r9T25onhq.jpg',
  'Spider-Man: Across the Spider-Verse': 'https://image.tmdb.org/t/p/w780/8Vt6mWEReuy4Of61Lnj5Xj704m8.jpg',
  'Interstellar': 'https://image.tmdb.org/t/p/w780/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg',
  'Everything Everywhere All at Once': 'https://image.tmdb.org/t/p/w780/w3LxiVYdWWRvEVdn5RYq6jIqkb1.jpg',
  'Oppenheimer': 'https://image.tmdb.org/t/p/w780/ptpr0kGAckfQkJeJIt8st5dglvd.jpg'
};
const catalog = [
  { title: 'Dune: Part Two', genre: 'Sci-Fi', duration: 166, rating: 'PG-13', synopsis: 'Paul Atreides unites with Chani and the Fremen while seeking revenge against the conspirators who destroyed his family.', featured: true },
  { title: 'The Batman', genre: 'Action', duration: 176, rating: 'PG-13', synopsis: 'Batman ventures into Gotham City’s underworld when a sadistic killer leaves behind a trail of cryptic clues.', featured: true },
  { title: 'Spider-Man: Across the Spider-Verse', genre: 'Animation', duration: 140, rating: 'PG', synopsis: 'Miles Morales journeys across the multiverse, meeting a new team of Spider-People along the way.', featured: true },
  { title: 'Interstellar', genre: 'Sci-Fi', duration: 169, rating: 'PG-13', synopsis: 'A team of explorers travels beyond this galaxy to discover whether mankind has a future among the stars.', featured: false },
  { title: 'Everything Everywhere All at Once', genre: 'Adventure', duration: 139, rating: 'R', synopsis: 'An exhausted laundromat owner must connect with parallel-universe versions of herself to save the multiverse.', featured: false },
  { title: 'Oppenheimer', genre: 'Drama', duration: 180, rating: 'R', synopsis: 'The story of J. Robert Oppenheimer and his role in developing the first atomic bomb.', featured: false }
];
const adminEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const adminPassword = process.env.ADMIN_PASSWORD || '';
if (!adminEmail || !/^\S+@\S+\.\S+$/.test(adminEmail) || adminPassword.length < 12) {
  console.error('Set ADMIN_EMAIL and an ADMIN_PASSWORD of at least 12 characters in server/.env before seeding.');
  process.exit(1);
}
try {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/imovies');
  for (const item of catalog) {
    const movie = await Movie.findOneAndUpdate({ title: item.title }, { ...item, posterUrl: posters[item.title], backdropUrl: posters[item.title], language: 'English' }, { upsert: true, new: true, setDefaultsOnInsert: true });
    if (!await Show.exists({ movie: movie._id })) {
      for (let day = 0; day < 3; day++) for (const time of ['12:30', '16:00', '19:30', '22:00']) {
        const date = new Date(); date.setDate(date.getDate() + day); date.setHours(0, 0, 0, 0);
        await Show.create({ movie: movie._id, cinema: 'IMovies Downtown', date, time, price: 12.5, seats: Array.from({ length: 60 }, (_, i) => ({ number: `${String.fromCharCode(65 + Math.floor(i / 10))}${(i % 10) + 1}`, booked: false })) });
      }
    }
  }
  const passwordHash = await bcrypt.hash(adminPassword, 12);
  const adminAccount = await User.findOneAndUpdate(
    { email: adminEmail },
    { $set: { role: 'admin', passwordHash }, $setOnInsert: { name: 'IMovies Admin' } },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );
  if (adminAccount.role !== 'admin') throw new Error('Administrator role verification failed after seeding.');
  console.log('Sample catalog, shows, and administrator are ready.');
} catch (error) { console.error(error); process.exitCode = 1; }
finally { await mongoose.disconnect(); }
