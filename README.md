# 🎬 IMovies – Movie Ticket Booking System

**IMovies** is a full-stack MERN application that provides an online movie ticket booking experience. Users can browse movies, explore showtimes, select seats, book tickets, and manage their bookings. Administrators can manage movies, theaters, screens, showtimes, and customer bookings through protected admin features.

## 🌐 Live Demo

- **Live Application:** [https://imovies-fawn.vercel.app/](https://imovies-fawn.vercel.app/)
- **GitHub Repository:** [https://github.com/PrekshaKushwaha06/imovies](https://github.com/PrekshaKushwaha06/imovies)

## ✨ Features

### 👤 Customer Features
- User registration and login.
- Secure authentication using JWT.
- Browse available movies and view movie details.
- Explore theaters and available showtimes.
- Select seats and book movie tickets.
- View personal booking history.
- Cancel bookings according to booking rules.
- Access digital tickets with printable details.
- Manage personal profile and change password.
- Maintain a personal watchlist.

### 🛠️ Admin Features
- Protected admin access with role-based authorization.
- Add, update, and delete movies.
- Manage theaters and screens.
- Create and manage movie showtimes.
- Prevent overlapping show schedules on the same screen.
- View and manage customer bookings.
- Access booking statistics and reports.

### 🔐 Security and Data Management
- Password hashing using bcryptjs.
- JWT-based authentication.
- Role-based access control.
- User-specific booking and watchlist management.
- Seat availability validation during booking.
- Protection against duplicate seat reservations.
- Booking cancellation with seat availability restoration.
- MongoDB integration using Mongoose.

## 🧰 Tech Stack

| Category | Technologies |
|---|---|
| Frontend | React.js, Vite, CSS, Bootstrap |
| Backend | Node.js, Express.js |
| Database | MongoDB Atlas, Mongoose |
| Authentication | JSON Web Tokens (JWT), bcryptjs |
| Routing | React Router |
| Icons | Lucide React |
| Testing | Node.js Test Runner |
| Deployment | Vercel, Render |
| Database Hosting | MongoDB Atlas |

## 🏗️ Project Structure

imovies/
├── client/    # React frontend
├── server/    # Node.js and Express backend
└── README.md

## ⚙️ Run Locally

Follow these steps to run IMovies on your local machine.

### Prerequisites

- [Node.js](https://nodejs.org/)
- npm (included with Node.js)
- [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) account or a compatible MongoDB connection.

### 1. Clone the Repository

```bash
git clone https://github.com/PrekshaKushwaha06/imovies.git
cd imovies
```

### 2. Configure the Backend

Navigate to the server directory and install dependencies:

```bash
cd server
npm install
```

Create a `.env` file inside the `server` directory using `server/.env.example` as a reference.

Add the required environment variables:

```env
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_secret_key
PORT=5000
CLIENT_URL=http://localhost:5173
```

Replace the placeholder values with your own configuration. Never commit your actual `.env` file or expose database credentials and secret keys.

### 3. Start the Backend

From the `server` directory, run:

```bash
npm run dev
```

The backend server will run at:

`http://localhost:5000`

### 4. Start the Frontend

Open a **second terminal** at the project root and navigate to the client directory:

```bash
cd client
npm install
npm run dev
```

The frontend will run at:

`http://localhost:5173`

You can now access IMovies through your browser.

## 🧪 Testing

The project includes automated backend and frontend tests using Node.js's built-in test runner.

### Backend Tests

```bash
cd server
npm test
```

### Frontend Tests

```bash
cd client
npm test
```

### Current Test Results

| Test Suite | Passed | Failed |
|---|---:|---:|
| Backend | 33 | 0 |
| Frontend | 2 | 0 |
| **Total** | **35** | **0** |

## 🏗️ Production Build

To generate an optimized production build of the frontend:

```bash
cd client
npm run build
```

The generated files will be available in the `client/dist` directory.

## 🚀 Deployment

IMovies is deployed using the following services:

| Component | Platform |
|---|---|
| Frontend | Vercel |
| Backend API | Render |
| Database | MongoDB Atlas |

**Live Application:** [https://imovies-fawn.vercel.app/](https://imovies-fawn.vercel.app/)

## 🔮 Future Enhancements

- Integration of an online payment gateway.
- Email booking confirmations and notifications.
- Movie reviews and ratings.
- Additional booking and analytics features.

## 👩‍💻 Developer

**Preksha Kushwaha**

B.Tech – Artificial Intelligence and Machine Learning

- GitHub: [PrekshaKushwaha06](https://github.com/PrekshaKushwaha06)

---

⭐ If you find this project interesting, consider giving the repository a star!
