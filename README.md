# IMovies — Movie Ticket Booking System

A full-stack movie booking MVP built with React, Vite, Bootstrap, Express, MongoDB, JWT, and bcrypt.

## Quick start (Windows)

1. Install Node.js 20+ and either MongoDB Community Server (running on its default port 27017) or create a MongoDB Atlas cluster.
2. `server/.env` is already created with a generated JWT secret and local MongoDB defaults. For Atlas, replace `MONGODB_URI` with your cluster connection string. In Atlas, create a database user and allow your current IP address. URL-encode special characters in the database user's password.
3. Open PowerShell in this project folder and install packages:

   ```powershell
   npm install
   npm --prefix server install
   npm --prefix client install
   ```

4. Seed the sample catalog and shows once, then start both apps:

   ```powershell
   npm run seed
   npm run dev
   ```

5. Open the Vite URL printed in the terminal (usually http://localhost:5173). The API runs on port 5000.

Register a customer account on the site. To create or repair the administrator, set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `server/.env` (use a unique password of at least 12 characters), then run `npm run seed`. The seed ensures that configured account has the `admin` role and sets its password to `ADMIN_PASSWORD`, including when that email already existed as a customer; it preserves other account data. Open **Sign in**, choose **Admin login**, and use those configured credentials. Keep `server/.env` private; `.env` files are ignored by Git. The committed `server/.env.example` leaves admin credentials blank.

## Scripts

- `npm run dev` — run client and API together.
- `npm run build` — build the production client.
- `npm test` — run the API authentication and admin access tests without connecting to MongoDB.
- `npm run seed` — add demo movies and shows (does not remove existing data).
- `npm start` — start the API in production; serve the client separately or configure a static host.

## Notes

Bookings reserve seats in MongoDB and are tied to the signed-in account. There is no payment gateway. Do not use demo credentials or this MVP as a production payment/booking system without adding validation, rate limiting, deployment secrets, and operational monitoring.
