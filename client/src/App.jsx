import { createContext, useContext, useEffect, useState } from 'react';
import { Link, NavLink, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowRight, Armchair, CalendarDays, Check, ChevronDown, Clapperboard, Clock3, Film, Heart, LogIn, LogOut, Menu, Printer, Search, ShieldCheck, Sparkles, Star, Ticket, User, X } from 'lucide-react';
import { filterAdminBookings, getAdminBookingStats } from './adminBookingStats.js';

const API = '/api';
async function request(path, options = {}) {
  const token = localStorage.getItem('imovies-token');
  const response = await fetch(API + path, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(data.message || 'Something went wrong.'); error.status = response.status; throw error; }
  return data;
}
const AuthContext = createContext(null);
const useAuth = () => useContext(AuthContext);
const placeholderMovies = [
  { _id: 'dune', title: 'Dune: Part Two', genre: 'Sci-Fi', duration: 166, rating: 'PG-13', synopsis: 'Paul Atreides unites with Chani and the Fremen while seeking revenge against the conspirators who destroyed his family.', posterUrl: 'https://image.tmdb.org/t/p/w780/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg', featured: true },
  { _id: 'batman', title: 'The Batman', genre: 'Action', duration: 176, rating: 'PG-13', synopsis: 'Batman ventures into Gotham City’s underworld when a sadistic killer leaves behind a trail of cryptic clues.', posterUrl: 'https://image.tmdb.org/t/p/w780/74xTEgt7R36Fpooo50r9T25onhq.jpg', featured: true },
  { _id: 'spider', title: 'Spider-Man: Across the Spider-Verse', genre: 'Animation', duration: 140, rating: 'PG', synopsis: 'Miles Morales journeys across the multiverse, meeting a new team of Spider-People along the way.', posterUrl: 'https://image.tmdb.org/t/p/w780/8Vt6mWEReuy4Of61Lnj5Xj704m8.jpg', featured: true },
  { _id: 'interstellar', title: 'Interstellar', genre: 'Sci-Fi', duration: 169, rating: 'PG-13', synopsis: 'A team of explorers travels beyond this galaxy to discover whether mankind has a future among the stars.', posterUrl: 'https://image.tmdb.org/t/p/w780/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg' },
  { _id: 'everything', title: 'Everything Everywhere All at Once', genre: 'Adventure', duration: 139, rating: 'R', synopsis: 'An exhausted laundromat owner must connect with parallel-universe versions of herself to save the multiverse.', posterUrl: 'https://image.tmdb.org/t/p/w780/w3LxiVYdWWRvEVdn5RYq6jIqkb1.jpg' },
  { _id: 'oppenheimer', title: 'Oppenheimer', genre: 'Drama', duration: 180, rating: 'R', synopsis: 'The story of J. Robert Oppenheimer and his role in developing the first atomic bomb.', posterUrl: 'https://image.tmdb.org/t/p/w780/ptpr0kGAckfQkJeJIt8st5dglvd.jpg' }
];

function App() {
  const [user, setUser] = useState(null);
  const [watchlist, setWatchlist] = useState([]);
  const [watchlistLoading, setWatchlistLoading] = useState(false);
  const [watchlistError, setWatchlistError] = useState('');
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [toast, setToast] = useState('');
  useEffect(() => { request('/auth/me').then(({ user }) => setUser(user)).catch((error) => { if (error.status === 401) localStorage.removeItem('imovies-token'); }); }, []);
  const notify = (message) => { setToast(message); window.setTimeout(() => setToast(''), 3500); };
  useEffect(() => {
    let active = true;
    if (user?.role !== 'customer') {
      setWatchlist([]); setWatchlistError(''); setWatchlistLoading(false);
      return () => { active = false; };
    }
    setWatchlistLoading(true); setWatchlistError('');
    request('/watchlist').then((movies) => { if (active) setWatchlist(movies); }).catch((error) => { if (active) setWatchlistError(error.message); }).finally(() => { if (active) setWatchlistLoading(false); });
    return () => { active = false; };
  }, [user]);
  const addWatchlistMovie = async (movie) => {
    await request(`/watchlist/${movie._id}`, { method: 'POST' });
    setWatchlist((current) => current.some((saved) => saved._id === movie._id) ? current : [...current, movie]);
    notify('Added to your watchlist.');
  };
  const removeWatchlistMovie = async (movie) => {
    await request(`/watchlist/${movie._id}`, { method: 'DELETE' });
    setWatchlist((current) => current.filter((saved) => saved._id !== movie._id));
    notify('Removed from your watchlist.');
  };
  const refreshWatchlist = async () => {
    setWatchlistLoading(true); setWatchlistError('');
    try { const movies = await request('/watchlist'); setWatchlist(movies); return movies; }
    catch (error) { setWatchlistError(error.message); throw error; }
    finally { setWatchlistLoading(false); }
  };
  const logout = () => { localStorage.removeItem('imovies-token'); setUser(null); notify('You have been signed out.'); };
  const openAuth = (mode = 'login') => { setAuthMode(mode); setAuthOpen(true); };
  return <AuthContext.Provider value={{ user, setUser, openAuth, notify, watchlist, watchlistLoading, watchlistError, addWatchlistMovie, removeWatchlistMovie, refreshWatchlist }}>
    <div className="app-shell">
      <Header onLogout={logout} />
      <main><Routes>
        <Route path="/" element={<Home />} />
        <Route path="/movies/:id" element={<MoviePage />} />
        <Route path="/bookings" element={<Bookings />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/tickets/:bookingId" element={<DigitalTicketPage />} />
        <Route path="/watchlist" element={<WatchlistPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Home />} />
      </Routes></main>
      <Footer />
      {authOpen && <AuthModal mode={authMode} setMode={setAuthMode} onClose={() => setAuthOpen(false)} />}
      {toast && <div className="toast-message"><Check size={17}/>{toast}</div>}
    </div>
  </AuthContext.Provider>;
}

function Header({ onLogout }) {
  const { user, openAuth } = useAuth();
  const [open, setOpen] = useState(false);
  return <header className="site-header"><div className="container header-inner">
    <Link className="brand" to="/"><span className="brand-mark"><Clapperboard size={19}/></span><span>i<span className="brand-accent">Movies</span></span></Link>
    <nav className={open ? 'nav-links nav-open' : 'nav-links'}>
      <NavLink onClick={() => setOpen(false)} to="/">Discover</NavLink>
      <a href="/#now-showing" onClick={() => setOpen(false)}>Now showing</a>
      {user && <NavLink onClick={() => setOpen(false)} to="/bookings">My tickets</NavLink>}
      {user?.role === 'customer' && <NavLink onClick={() => setOpen(false)} to="/watchlist">My Watchlist</NavLink>}
      {user?.role === 'customer' && <NavLink onClick={() => setOpen(false)} to="/profile">My Profile</NavLink>}
      {user?.role === 'admin' && <NavLink onClick={() => setOpen(false)} to="/admin">Manage</NavLink>}
    </nav>
    <div className="header-actions">
      {user ? <><span className="welcome-user d-none d-sm-inline">Hi, {user.name.split(' ')[0]}</span><button className="icon-button" aria-label="Sign out" onClick={onLogout}><LogOut size={18}/></button></> : <button className="button button-small button-ghost sign-in" onClick={() => openAuth('login')}><User size={16}/> Sign in</button>}
      <button className="mobile-menu" aria-label="Toggle menu" onClick={() => setOpen(!open)}>{open ? <X/> : <Menu/>}</button>
    </div>
  </div></header>;
}

function Home() {
  const [movies, setMovies] = useState([]);
  const [search, setSearch] = useState('');
  const [genre, setGenre] = useState('All');
  const [loading, setLoading] = useState(true);
  const genres = ['All', 'Action', 'Adventure', 'Animation', 'Drama', 'Sci-Fi'];
  useEffect(() => { let active = true; setLoading(true); const params = new URLSearchParams(); if (search) params.set('search', search); if (genre !== 'All') params.set('genre', genre); request(`/movies?${params}`).then((data) => { if (active) setMovies(data.length ? data : placeholderMovies); }).catch(() => { if (active) setMovies(placeholderMovies); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [search, genre]);
  const hero = movies.find((movie) => movie.featured) || movies[0] || placeholderMovies[0];
  return <>
    <section className="hero" style={{ '--hero-image': `url(${hero.backdropUrl || hero.posterUrl})` }}><div className="container hero-content">
      <div className="eyebrow"><Sparkles size={14}/> YOUR NEXT GREAT NIGHT OUT</div>
      <h1>Stories worth<br/>the <em>big screen.</em></h1>
      <p>Find your next favorite movie. The best seats are just a few clicks away.</p>
      <div className="hero-buttons"><a className="button button-primary" href="#now-showing">Explore movies <ArrowRight size={17}/></a><a className="hero-link" href="#how-it-works">How it works <ArrowDown size={16}/></a></div>
      <div className="hero-note"><span className="note-stars">★★★★★</span><span>Good movies. Great memories.</span></div>
    </div><div className="hero-side-label">THE SHOW STARTS HERE</div><div className="hero-fade"/></section>
    <section className="catalog-section" id="now-showing"><div className="container">
      <div className="section-heading"><div><div className="eyebrow muted-eyebrow">HAND PICKED FOR YOU</div><h2>Now <span>showing</span></h2></div><p>Big stories, unforgettable moments.</p></div>
      <div className="catalog-toolbar"><div className="genre-list">{genres.map((item) => <button key={item} onClick={() => setGenre(item)} className={`genre-chip ${genre === item ? 'active' : ''}`}>{item}</button>)}</div><label className="search-box"><Search size={17}/><input placeholder="Find a movie..." value={search} onChange={(e) => setSearch(e.target.value)}/></label></div>
      {loading ? <div className="loading-row"><span className="spinner-border spinner-border-sm"/> Finding your next movie…</div> : movies.length ? <div className="movie-grid">{movies.map((movie, index) => <MovieCard movie={movie} index={index} key={movie._id}/>)}</div> : <div className="empty-state">No movies match that search. Try another title.</div>}
      <div className="catalog-footnote"><span className="footnote-line"/> MADE FOR THE MOMENTS THAT MATTER <span className="footnote-line"/></div>
    </div></section>
    <HowItWorks/>
  </>;
}

function MovieCard({ movie, index = 0 }) {
  return <div className="movie-card-shell">
    <Link to={`/movies/${movie._id}`} className="movie-card" style={{ '--card-delay': `${index * 60}ms` }}>
      <div className="poster-wrap"><img src={movie.posterUrl} alt={`${movie.title} poster`} loading="lazy"/><span className="poster-rating"><Star size={12} fill="currentColor"/> {movie.rating || 'PG-13'}</span><span className="poster-arrow"><ArrowRight size={18}/></span></div>
      <div className="movie-meta"><div><span className="movie-genre">{movie.genre}</span><span className="meta-dot">·</span><span className="movie-runtime">{movie.duration} min</span></div><h3>{movie.title}</h3><span className="book-link">Get tickets <ArrowRight size={14}/></span></div>
    </Link>
    <WatchlistButton movie={movie}/>
  </div>;
}

function WatchlistButton({ movie, detail = false }) {
  const { user, watchlist, openAuth, notify, addWatchlistMovie, removeWatchlistMovie } = useAuth();
  const [busy, setBusy] = useState(false);
  if (user?.role === 'admin') return null;
  const saved = watchlist.some((item) => item._id === movie._id);
  const toggle = async (event) => {
    event.preventDefault(); event.stopPropagation();
    if (!user) { openAuth('login'); return; }
    if (user.role !== 'customer') { notify('Watchlists are available to customer accounts.'); return; }
    setBusy(true);
    try { await (saved ? removeWatchlistMovie(movie) : addWatchlistMovie(movie)); }
    catch (error) { notify(error.message); }
    finally { setBusy(false); }
  };
  return <button type="button" className={`watchlist-heart ${detail ? 'watchlist-heart-detail' : ''} ${saved ? 'saved' : ''}`} aria-label={saved ? `Remove ${movie.title} from watchlist` : `Add ${movie.title} to watchlist`} aria-pressed={saved} title={saved ? 'Remove from watchlist' : 'Add to watchlist'} disabled={busy} onClick={toggle}><Heart size={detail ? 17 : 16} fill={saved ? 'currentColor' : 'none'}/></button>;
}
function HowItWorks() {
  const steps = [{ icon: <Search/>, title: 'Find your film', text: 'Explore hand-picked favorites, fresh releases and old-school classics.' }, { icon: <Armchair/>, title: 'Pick your seats', text: 'Choose exactly where you want to sit. Your ideal movie night, your way.' }, { icon: <Ticket/>, title: 'Show up & enjoy', text: 'Your tickets are ready. Grab some popcorn and settle in.' }];
  return <section className="how-section" id="how-it-works"><div className="container"><div className="section-heading"><div><div className="eyebrow muted-eyebrow">THE EASY PART</div><h2>Three steps to <span>movie night.</span></h2></div><span className="how-side-note">YOUR EVENING, SORTED.</span></div><div className="steps-grid">{steps.map((step, i) => <div className="step-card" key={step.title}><div className="step-number">0{i + 1}</div><div className="step-icon">{step.icon}</div><h3>{step.title}</h3><p>{step.text}</p><div className="step-line"/></div>)}</div></div></section>;
}

function MoviePage() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { setData(null); setError(''); request(`/movies/${id}`).then(setData).catch((err) => setError(err.message)); }, [id]);
  if (error) return <div className="container page-state"><h2>Movie unavailable</h2><p>{error}</p><Link className="button button-primary" to="/">Back to movies</Link></div>;
  if (!data) return <div className="container page-state"><span className="spinner-border"/></div>;
  const { movie, shows } = data;
  return <section className="movie-detail" style={{ '--detail-image': `url(${movie.backdropUrl || movie.posterUrl})` }}><div className="detail-backdrop"/><div className="container detail-content"><Link to="/" className="back-link">← All movies</Link><div className="detail-layout"><img className="detail-poster" src={movie.posterUrl} alt={`${movie.title} poster`}/><div className="detail-copy"><div className="eyebrow"><Film size={14}/> {movie.genre}</div><h1>{movie.title}</h1><WatchlistButton movie={movie} detail/><div className="detail-tags"><span><Clock3 size={15}/>{Math.floor(movie.duration / 60)}h {movie.duration % 60}m</span><span>{movie.rating}</span><span>{movie.language || 'English'}</span></div><p>{movie.synopsis}</p><h2 className="showtime-title"><CalendarDays size={19}/> Choose a showtime</h2>{shows.length ? <div className="show-grid">{shows.map((show) => <ShowCard show={show} key={show._id}/>)}</div> : <p className="empty-state">No upcoming showtimes yet. Check back soon.</p>}</div></div></div></section>;
}

function ShowCard({ show }) {
  const { user, openAuth, notify } = useAuth();
  const [selected, setSelected] = useState([]);
  const [saving, setSaving] = useState(false);
  const date = new Date(show.date);
  const dayLabel = date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const venueLabel = show.theater ? `${show.theater.name}${show.screen?.name ? ` · ${show.screen.name}` : ''} · ${show.theater.location}` : show.cinema;
  const submit = async () => {
    if (!user) return openAuth('login');
    if (!selected.length) return notify('Choose at least one seat first.');
    setSaving(true);
    try { const booking = await request('/bookings', { method: 'POST', body: JSON.stringify({ showId: show._id, seats: selected }) }); notify(`Booking confirmed · ${booking.bookingCode}`); setSelected([]); window.setTimeout(() => window.location.assign('/bookings'), 650); }
    catch (error) { notify(error.message); }
    finally { setSaving(false); }
  };
  return <div className="show-card"><div className="show-top"><div><span>{dayLabel}</span><strong>{show.time}</strong></div><b>${Number(show.price).toFixed(2)}<small> / seat</small></b></div><div className="show-cinema">{venueLabel}</div><div className="seat-picker"><div className="screen-label"><span/> SCREEN <span/></div><div className="seat-grid">{(show.seats || []).map((seat) => <button title={`${seat.number}${seat.booked ? ' · booked' : ''}`} disabled={seat.booked || saving} aria-label={`Seat ${seat.number}${seat.booked ? ', booked' : ''}`} key={seat.number} className={`seat ${seat.booked ? 'booked' : ''} ${selected.includes(seat.number) ? 'selected' : ''}`} onClick={() => setSelected((current) => current.includes(seat.number) ? current.filter((n) => n !== seat.number) : current.length >= 8 ? current : [...current, seat.number])}>{seat.number.slice(1)}</button>)}</div><div className="seat-legend"><span><i className="legend-open"/>Available</span><span><i className="legend-selected"/>Selected</span><span><i className="legend-booked"/>Booked</span></div></div><button disabled={saving || !selected.length} className="button button-primary button-block" onClick={submit}>{saving ? 'Confirming…' : `Book ${selected.length || ''} seat${selected.length === 1 ? '' : 's'}${selected.length ? ` · $${(selected.length * Number(show.price)).toFixed(2)}` : ''}`} <ArrowRight size={15}/></button></div>;
}

function ProfilePage() {
  const { user, openAuth, setUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [name, setName] = useState(user?.name || '');
  const [loading, setLoading] = useState(Boolean(user?.role === 'customer'));
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  useEffect(() => {
    let active = true;
    if (user?.role !== 'customer') { setLoading(false); setProfile(null); return () => { active = false; }; }
    setLoading(true); setProfileError('');
    request('/profile').then(({ user: result }) => {
      if (active) { setProfile(result); setName(result.name || ''); }
    }).catch((error) => { if (active) setProfileError(error.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user]);

  const updateProfile = async (event) => {
    event.preventDefault(); setProfileError(''); setProfileSuccess('');
    if (name.trim().length < 2 || name.trim().length > 80) { setProfileError('Enter a name between 2 and 80 characters.'); return; }
    setSavingProfile(true);
    try {
      const { user: result } = await request('/profile', { method: 'PUT', body: JSON.stringify({ name }) });
      setProfile(result); setName(result.name); setUser((current) => current ? { ...current, ...result } : current); setProfileSuccess('Your profile has been updated.');
    } catch (error) { setProfileError(error.message); }
    finally { setSavingProfile(false); }
  };

  const updatePassword = async (event) => {
    event.preventDefault(); setPasswordError(''); setPasswordSuccess('');
    if (newPassword.length < 8) { setPasswordError('Your new password must be at least 8 characters.'); return; }
    if (newPassword !== confirmPassword) { setPasswordError('The new passwords do not match.'); return; }
    setSavingPassword(true);
    try {
      const result = await request('/profile/password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) });
      setPasswordSuccess(result.message || 'Your password has been updated.');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (error) { setPasswordError(error.message); }
    finally { setSavingPassword(false); }
  };

  if (!user) return <div className="container page-state"><User size={42}/><h2>Your account, in one place.</h2><p>Sign in with a customer account to view your profile.</p><button className="button button-primary" onClick={() => openAuth('login')}>Sign in</button></div>;
  if (user.role !== 'customer') return <div className="container page-state"><ShieldCheck size={42}/><h2>Customer access required</h2><p>This profile page is available to customer accounts.</p><Link className="button button-primary" to="/">Back to movies</Link></div>;
  return <section className="account-section"><div className="container profile-container">
    <div className="eyebrow muted-eyebrow">YOUR ACCOUNT</div><h1>My <span>Profile.</span></h1><p className="account-intro">Manage your personal details and keep your account secure.</p>
    {loading ? <div className="loading-row"><span className="spinner-border spinner-border-sm"/> Loading your profile…</div> : profileError && !profile ? <div className="alert alert-warning" role="alert">{profileError}</div> : <div className="profile-grid">
      <section className="profile-panel"><div className="panel-heading"><div><span>PERSONAL DETAILS</span><h2>Profile information</h2></div><User/></div>
        {profileError && <div className="profile-message profile-error" role="alert">{profileError}</div>}{profileSuccess && <div className="profile-message profile-success" role="status">{profileSuccess}</div>}
        <form onSubmit={updateProfile}>
          <div className="form-field"><label htmlFor="profile-name">Name</label><input id="profile-name" name="name" autoComplete="name" maxLength={80} required value={name} onChange={(event) => setName(event.target.value)}/></div>
          <div className="form-field"><label htmlFor="profile-email">Email</label><input id="profile-email" type="email" value={profile?.email || user.email || ''} readOnly disabled/><p className="form-hint">Email changes are not available for this account.</p></div>
          <button className="button button-primary" disabled={savingProfile || loading}>{savingProfile ? 'Saving…' : 'Save changes'} <ArrowRight size={15}/></button>
        </form>
      </section>
      <section className="profile-panel"><div className="panel-heading"><div><span>ACCOUNT SECURITY</span><h2>Change password</h2></div><ShieldCheck/></div>
        {passwordError && <div className="profile-message profile-error" role="alert">{passwordError}</div>}{passwordSuccess && <div className="profile-message profile-success" role="status">{passwordSuccess}</div>}
        <form onSubmit={updatePassword}>
          <div className="form-field"><label htmlFor="current-password">Current password</label><input id="current-password" type="password" autoComplete="current-password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)}/></div>
          <div className="form-field"><label htmlFor="new-password">New password</label><input id="new-password" type="password" autoComplete="new-password" minLength={8} maxLength={72} required value={newPassword} onChange={(event) => setNewPassword(event.target.value)}/></div>
          <div className="form-field"><label htmlFor="confirm-password">Confirm new password</label><input id="confirm-password" type="password" autoComplete="new-password" minLength={8} maxLength={72} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)}/></div>
          <p className="form-hint">Use at least 8 characters. Your current password is required to confirm this change.</p>
          <button className="button button-primary" disabled={savingPassword}>{savingPassword ? 'Updating…' : 'Update password'} <ArrowRight size={15}/></button>
        </form>
      </section>
    </div>}
  </div></section>;
}

function WatchlistPage() {
  const { user, openAuth, watchlist, watchlistLoading, watchlistError, refreshWatchlist } = useAuth();
  if (!user) return <div className="container page-state"><Heart size={42}/><h2>Your saved movies, all in one place.</h2><p>Sign in with a customer account to view your watchlist.</p><button className="button button-primary" onClick={() => openAuth('login')}>Sign in</button></div>;
  if (user.role !== 'customer') return <div className="container page-state"><Heart size={42}/><h2>Customer access required</h2><p>Watchlists are available to customer accounts.</p><Link className="button button-primary" to="/">Back to movies</Link></div>;
  return <section className="account-section"><div className="container watchlist-container"><div className="eyebrow muted-eyebrow">YOUR NEXT MOVIE NIGHT</div><h1>My <span>Watchlist.</span></h1><p className="account-intro">The movies you want to keep close.</p>{watchlistError && <div className="alert alert-warning" role="alert">{watchlistError}<button type="button" className="watchlist-retry" onClick={() => refreshWatchlist().catch(() => {})}>Try again</button></div>}{watchlistLoading ? <div className="loading-row"><span className="spinner-border spinner-border-sm"/> Loading your watchlist…</div> : watchlistError ? null : watchlist.length ? <div className="movie-grid">{watchlist.map((movie, index) => <MovieCard movie={movie} index={index} key={movie._id}/>)}</div> : <div className="empty-account"><Heart size={34}/><h3>Your watchlist is waiting</h3><p>Save movies with the heart button and they will appear here.</p><Link to="/" className="button button-primary">Explore movies <ArrowRight size={16}/></Link></div>}</div></section>;
}

function Bookings() {
  const { user, openAuth, notify } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState('');
  const load = async () => {
    setError('');
    const data = await request('/bookings/mine');
    setBookings(data);
  };
  useEffect(() => {
    let active = true;
    if (user) {
      setLoading(true);
      request('/bookings/mine').then((data) => { if (active) setBookings(data); }).catch((err) => { if (active) setError(err.message); }).finally(() => { if (active) setLoading(false); });
    }
    return () => { active = false; };
  }, [user]);
  const cancelBooking = async (booking) => {
    if (!window.confirm(`Cancel booking ${booking.bookingCode}? Seats will be released. No refund is processed by this site.`)) return;
    setCancelling(booking._id);
    setError('');
    try {
      await request(`/bookings/${booking._id}/cancel`, { method: 'POST' });
      await load();
      notify('Booking cancelled and seats released.');
    } catch (err) {
      setError(err.message);
      notify(err.message);
      try { await load(); } catch { /* Keep the cancellation error visible. */ }
    } finally { setCancelling(''); }
  };
  if (!user) return <div className="container page-state"><Ticket size={42}/><h2>Your movie nights, all in one place.</h2><p>Sign in to view your bookings and tickets.</p><button className="button button-primary" onClick={() => openAuth('login')}>Sign in</button></div>;
  return <section className="account-section"><div className="container account-container"><div className="eyebrow muted-eyebrow">YOUR MOVIE NIGHTS</div><h1>My <span>tickets.</span></h1><p className="account-intro">Keep your next great night out close at hand.</p>{error && <div className="alert alert-warning" role="alert">{error}</div>}{loading ? <div className="loading-row"><span className="spinner-border spinner-border-sm"/> Loading your bookings…</div> : bookings.length ? <div className="booking-list">{bookings.map((booking) => <BookingCard booking={booking} key={booking._id} onCancel={cancelBooking} busy={cancelling === booking._id}/>)}</div> : <div className="empty-account"><Ticket size={34}/><h3>No tickets yet</h3><p>Your next favorite movie is waiting.</p><Link to="/" className="button button-primary">Explore movies <ArrowRight size={16}/></Link></div>}</div></section>;
}

function BookingCard({ booking, onCancel, busy }) {
  const movie = booking.show?.movie;
  const show = booking.show;
  const statusLabel = booking.status === 'cancelled' ? 'Cancelled' : booking.status === 'cancelling' ? 'Cancellation pending' : 'Active';
  return <div className={`booking-card booking-${booking.status || 'active'}`}><img src={movie?.posterUrl || placeholderMovies[0].posterUrl} alt=""/><div className="booking-details"><span className="movie-genre">{booking.bookingCode}</span><h3>{movie?.title || 'Movie'}</h3><div className="booking-info"><span><CalendarDays size={15}/>{show ? new Date(show.date).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }) : 'Show unavailable'} · {show?.time}</span><span><Armchair size={15}/>Seats {booking.seats.join(', ')}</span><span className="booking-status">Status: {statusLabel}</span></div><Link className="button button-small button-ghost view-ticket-button" to={`/tickets/${booking._id}`}><Ticket size={14}/> View Ticket</Link>{booking.canCancel && <button className="button button-small button-ghost cancel-booking-button" disabled={busy} onClick={() => onCancel(booking)}>{busy ? 'Cancelling…' : booking.status === 'cancelling' ? 'Retry cancellation' : 'Cancel booking'}</button>}</div><div className="booking-total"><span>Total</span><strong>${Number(booking.total).toFixed(2)}</strong></div></div>;
}

function DigitalTicketPage() {
  const { bookingId } = useParams();
  const { user, openAuth } = useAuth();
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    if (!user) { setLoading(false); setTicket(null); return () => { active = false; }; }
    setLoading(true); setError(''); setTicket(null);
    request(`/bookings/${bookingId}/ticket`).then((data) => { if (active) setTicket(data); }).catch((err) => { if (active) setError(err.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [bookingId, user]);
  if (!user) return <div className="container page-state"><Ticket size={42}/><h2>Your ticket is protected</h2><p>Sign in to view a ticket for one of your bookings.</p><button className="button button-primary" onClick={() => openAuth('login')}>Sign in</button></div>;
  if (loading) return <div className="container page-state"><span className="spinner-border" role="status" aria-label="Loading ticket"/><h2>Preparing your ticket</h2></div>;
  if (error) return <div className="container page-state"><Ticket size={42}/><h2>Ticket unavailable</h2><p>{error}</p><Link className="button button-primary" to={user.role === 'admin' ? '/admin' : '/bookings'}>Back</Link></div>;
  if (!ticket) return null;
  const cancelled = ticket.status === 'Cancelled';
  const showDate = ticket.showDate ? new Date(ticket.showDate).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : 'Show details unavailable';
  const bookingDate = ticket.bookingDate ? new Date(ticket.bookingDate).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : 'Booking date unavailable';
  return <section className="digital-ticket-page"><div className="digital-ticket-wrap"><div className={`digital-ticket ${cancelled ? 'ticket-cancelled' : ''}`}>
    <div className="ticket-brand-row"><div className="ticket-brand"><span className="ticket-brand-icon"><Clapperboard size={20}/></span><strong>iMovies</strong></div><span className="ticket-label">DIGITAL MOVIE TICKET</span></div>
    {cancelled && <div className="ticket-cancelled-stamp" role="status">CANCELLED</div>}
    <div className="ticket-film-row">{ticket.movie?.posterUrl && <img className="ticket-poster" src={ticket.movie.posterUrl} alt={`${ticket.movie.title || 'Movie'} poster`}/>}<div className="ticket-film-info"><span className="ticket-overline">YOUR MOVIE NIGHT</span><h1>{ticket.movie?.title || 'Movie details unavailable'}</h1><div className="ticket-code-label">BOOKING CODE</div><strong className="ticket-code">{ticket.bookingCode || 'Unavailable'}</strong></div></div>
    <div className="ticket-detail-grid"><div><span>THEATER</span><strong>{ticket.venueName || 'Theater details unavailable'}</strong></div><div><span>SCREEN</span><strong>{ticket.screenName || 'Screen details unavailable'}</strong></div><div><span>SHOW DATE</span><strong>{showDate}</strong></div><div><span>SHOW TIME</span><strong>{ticket.showTime || 'Unavailable'}</strong></div><div><span>SEATS</span><strong>{ticket.seats.length ? ticket.seats.join(', ') : 'Seat details unavailable'}</strong></div><div><span>TOTAL BOOKING AMOUNT</span><strong>{ticket.total === null ? 'Unavailable' : `$${Number(ticket.total).toFixed(2)}`}</strong></div><div><span>BOOKING STATUS</span><strong className={cancelled ? 'ticket-status-cancelled' : 'ticket-status-active'}>{ticket.status}</strong></div><div><span>BOOKING DATE</span><strong>{bookingDate}</strong></div></div>
    <p className="ticket-footer-note">Please keep this ticket code available when you arrive. This ticket is not a payment receipt.</p>
  </div><div className="ticket-actions"><button type="button" className="button button-primary" onClick={() => window.print()}><Printer size={16}/> Print Ticket</button><Link className="button button-ghost" to={user.role === 'admin' ? '/admin' : '/bookings'}>Back to {user.role === 'admin' ? 'bookings' : 'my tickets'}</Link></div></div></section>;
}
function AdminPage() {
  const { user, openAuth, notify } = useAuth();
  const [movies, setMovies] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [theaters, setTheaters] = useState([]);
  const [screens, setScreens] = useState([]);
  const [shows, setShows] = useState([]);
  const [reports, setReports] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const blankMovie = { title: '', synopsis: '', posterUrl: '', backdropUrl: '', genre: 'Drama', duration: 120, rating: 'PG-13', language: 'English', releaseDate: '', featured: false };
  const [movieForm, setMovieForm] = useState(blankMovie);
  const [editingMovie, setEditingMovie] = useState('');
  const [movieError, setMovieError] = useState('');
  const [selectedTheater, setSelectedTheater] = useState('');
  const [theaterForm, setTheaterForm] = useState({ name: '', location: '' });
  const [editingTheater, setEditingTheater] = useState('');
  const [screenForm, setScreenForm] = useState({ name: '', seatCapacity: 60 });
  const [editingScreen, setEditingScreen] = useState('');
  const [showForm, setShowForm] = useState({ movie: '', theater: '', screen: '', date: '', time: '19:30', price: 12.5 });
  const [editingShow, setEditingShow] = useState('');
  const [bookingFilter, setBookingFilter] = useState('all');

  const load = async () => {
    setLoadError('');
    setLoading(true);
    try {
      const [movieData, bookingData, theaterData, screenData, showData, reportData] = await Promise.all([
        request('/movies'), request('/admin/bookings'), request('/admin/theaters'), request('/admin/screens'), request('/admin/shows'), request('/admin/reports')
      ]);
      setMovies(movieData);
      setBookings(bookingData);
      setTheaters(theaterData);
      setScreens(screenData);
      setShows(showData);
      setReports(reportData);
      const theaterId = theaterData.some((item) => item._id === selectedTheater) ? selectedTheater : (theaterData[0]?._id || '');
      const theaterScreens = screenData.filter((item) => String(item.theater?._id || item.theater) === theaterId);
      setSelectedTheater(theaterId);
      setShowForm((current) => ({
        ...current,
        movie: movieData.some((item) => item._id === current.movie) ? current.movie : (movieData[0]?._id || ''),
        theater: theaterData.some((item) => item._id === current.theater) ? current.theater : theaterId,
        screen: theaterScreens.some((item) => item._id === current.screen) ? current.screen : (theaterScreens[0]?._id || '')
      }));
    } catch (error) {
      setLoadError(error.message);
      throw error;
    } finally { setLoading(false); }
  };
  useEffect(() => { if (user?.role === 'admin') load().catch(() => {}); }, [user]);
  if (!user) return <div className="container page-state"><ShieldCheck size={42}/><h2>Admin access</h2><p>Sign in with an administrator account to manage the cinema.</p><button className="button button-primary" onClick={() => openAuth('login')}>Sign in</button></div>;
  if (user.role !== 'admin') return <div className="container page-state"><ShieldCheck size={42}/><h2>Administrator access required</h2><p>This area is only available to an administrator account.</p><Link className="button button-primary" to="/">Back to movies</Link></div>;
  if (loading) return <div className="container page-state"><span className="spinner-border spinner-border-sm" role="status" aria-label="Loading admin dashboard"/><h2>Loading your dashboard</h2><p>Fetching movies, theaters, screens, shows, and bookings.</p></div>;
  if (loadError) return <div className="container page-state"><ShieldCheck size={42}/><h2>Dashboard unavailable</h2><p>{loadError}</p><button className="button button-primary" onClick={() => load().catch(() => {})}>Try again</button></div>;

  const theaterIdForScreen = (screen) => String(screen.theater?._id || screen.theater || '');
  const resetShowForm = () => { setEditingShow(''); setShowForm({ movie: movies[0]?._id || '', theater: selectedTheater || theaters[0]?._id || '', screen: screens.find((screen) => theaterIdForScreen(screen) === (selectedTheater || theaters[0]?._id))?._id || '', date: '', time: '19:30', price: 12.5 }); };
  const beginEditMovie = (movie) => {
    setMovieError(''); setEditingMovie(movie._id);
    setMovieForm({ title: movie.title || '', synopsis: movie.synopsis || '', posterUrl: movie.posterUrl || '', backdropUrl: movie.backdropUrl || '', genre: movie.genre || '', duration: Number(movie.duration) || 1, rating: movie.rating || 'PG-13', language: movie.language || 'English', releaseDate: movie.releaseDate ? new Date(movie.releaseDate).toISOString().slice(0, 10) : '', featured: Boolean(movie.featured) });
  };
  const cancelMovieEdit = () => { setEditingMovie(''); setMovieError(''); setMovieForm(blankMovie); };
  const saveMovie = async (event) => {
    event.preventDefault(); setBusy(true); setMovieError('');
    const payload = { ...movieForm };
    if (!payload.backdropUrl.trim()) payload.backdropUrl = editingMovie ? null : undefined;
    if (!payload.releaseDate) payload.releaseDate = editingMovie ? null : undefined;
    Object.keys(payload).forEach((key) => payload[key] === undefined && delete payload[key]);
    try {
      await request(editingMovie ? `/admin/movies/${editingMovie}` : '/admin/movies', { method: editingMovie ? 'PUT' : 'POST', body: JSON.stringify(payload) });
      const wasEditing = Boolean(editingMovie); cancelMovieEdit(); await load(); notify(wasEditing ? 'Movie changes saved.' : 'Movie added to your catalog.');
    } catch (error) { setMovieError(error.message); notify(error.message); } finally { setBusy(false); }
  };
  const removeMovie = async (id) => {
    if (!window.confirm('Delete this movie? Movies with shows or booking history are kept.')) return;
    setBusy(true);
    try { await request(`/admin/movies/${id}`, { method: 'DELETE' }); if (editingMovie === id) cancelMovieEdit(); await load(); notify('Movie deleted.'); }
    catch (error) { notify(error.message); } finally { setBusy(false); }
  };
  const saveTheater = async (event) => {
    event.preventDefault(); setBusy(true);
    try {
      const result = await request(editingTheater ? `/admin/theaters/${editingTheater}` : '/admin/theaters', { method: editingTheater ? 'PUT' : 'POST', body: JSON.stringify(theaterForm) });
      const theaterId = result._id; setTheaterForm({ name: '', location: '' }); setEditingTheater(''); setSelectedTheater(theaterId); await load(); notify(editingTheater ? 'Theater updated.' : 'Theater added.');
    } catch (error) { notify(error.message); } finally { setBusy(false); }
  };
  const editTheater = (theater) => { setSelectedTheater(theater._id); setEditingTheater(theater._id); setTheaterForm({ name: theater.name, location: theater.location }); };
  const deleteTheater = async (theater) => {
    if (!window.confirm(`Delete ${theater.name}? The server will prevent deletion while screens or shows depend on it.`)) return;
    setBusy(true);
    try { await request(`/admin/theaters/${theater._id}`, { method: 'DELETE' }); if (editingTheater === theater._id) { setEditingTheater(''); setTheaterForm({ name: '', location: '' }); } await load(); notify('Theater deleted.'); }
    catch (error) { notify(error.message); } finally { setBusy(false); }
  };
  const saveScreen = async (event) => {
    event.preventDefault(); setBusy(true);
    try {
      const body = { theater: selectedTheater, name: screenForm.name, seatCapacity: Number(screenForm.seatCapacity) };
      await request(editingScreen ? `/admin/screens/${editingScreen}` : `/admin/theaters/${selectedTheater}/screens`, { method: editingScreen ? 'PUT' : 'POST', body: JSON.stringify(body) });
      setScreenForm({ name: '', seatCapacity: 60 }); setEditingScreen(''); await load(); notify(editingScreen ? 'Screen updated.' : 'Screen added.');
    } catch (error) { notify(error.message); } finally { setBusy(false); }
  };
  const editScreen = (screen) => { setSelectedTheater(theaterIdForScreen(screen)); setEditingScreen(screen._id); setScreenForm({ name: screen.name, seatCapacity: screen.seatCapacity }); };
  const deleteScreen = async (screen) => {
    if (!window.confirm(`Delete ${screen.name}? Screens linked to shows cannot be deleted.`)) return;
    setBusy(true);
    try { await request(`/admin/screens/${screen._id}`, { method: 'DELETE' }); if (editingScreen === screen._id) { setEditingScreen(''); setScreenForm({ name: '', seatCapacity: 60 }); } await load(); notify('Screen deleted.'); }
    catch (error) { notify(error.message); } finally { setBusy(false); }
  };
  const saveShow = async (event) => {
    event.preventDefault(); setBusy(true);
    try {
      await request(editingShow ? `/admin/shows/${editingShow}` : '/admin/shows', { method: editingShow ? 'PUT' : 'POST', body: JSON.stringify({ ...showForm, price: Number(showForm.price) }) });
      const wasEditing = Boolean(editingShow); resetShowForm(); await load(); notify(wasEditing ? 'Show changes saved.' : 'Showtime is live.');
    } catch (error) { notify(error.message); } finally { setBusy(false); }
  };
  const editShow = (show) => {
    const theaterId = String(show.theater?._id || show.theater || '') || selectedTheater || theaters[0]?._id || '';
    const theaterScreens = screens.filter((screen) => theaterIdForScreen(screen) === theaterId);
    setEditingShow(show._id);
    setShowForm({ movie: String(show.movie?._id || show.movie || ''), theater: theaterId, screen: String(show.screen?._id || show.screen || '') || theaterScreens[0]?._id || '', date: show.date ? new Date(show.date).toISOString().slice(0, 10) : '', time: show.time || '19:30', price: Number(show.price) || 0 });
  };
  const deleteShow = async (show) => {
    if (!window.confirm('Delete this show? Shows with booking history are retained.')) return;
    setBusy(true);
    try { await request(`/admin/shows/${show._id}`, { method: 'DELETE' }); if (editingShow === show._id) resetShowForm(); await load(); notify('Show deleted.'); }
    catch (error) { notify(error.message); } finally { setBusy(false); }
  };
  const cancelBooking = async (booking) => {
    if (!window.confirm(`Cancel booking ${booking.bookingCode}? No refund is processed by this site.`)) return;
    setBusy(true);
    try { await request(`/admin/bookings/${booking.id}/cancel`, { method: 'POST' }); await load(); notify('Booking cancelled and seats released.'); }
    catch (error) { notify(error.message); } finally { setBusy(false); }
  };
  const screensForTheater = screens.filter((screen) => theaterIdForScreen(screen) === selectedTheater);
  const screensForShowForm = screens.filter((screen) => theaterIdForScreen(screen) === showForm.theater);
  const bookingStats = getAdminBookingStats(bookings);
  const visibleBookings = filterAdminBookings(bookings, bookingFilter);
  const busiestDateCount = (reports?.bookingsByDate || []).reduce((max, day) => Math.max(max, day.count), 1);

  return <section className="account-section"><div className="container admin-container">
    <div className="eyebrow muted-eyebrow">IMOVIES CONTROL ROOM</div><h1>Manage the <span>magic.</span></h1><p className="account-intro">Manage films, theaters, screens, showtimes, and customer bookings.</p><a className="button button-small button-ghost reports-jump-link" href="#admin-reports">Reports &amp; Analytics</a>
    <div className="admin-stats"><div><Film/><span>In your catalog</span><strong>{movies.length}</strong></div><div><CalendarDays/><span>All shows</span><strong>{shows.length}</strong></div><div><Ticket/><span>Total Bookings</span><strong>{bookingStats.total}</strong></div><div><Ticket/><span>Active Bookings</span><strong>{bookingStats.active}</strong></div><div><Ticket/><span>Cancelled Bookings</span><strong>{bookingStats.cancelled}</strong></div></div>
    <div className="admin-grid">
      <form className="admin-panel" onSubmit={saveMovie}>
        <div className="panel-heading"><div><span>01 / CATALOG</span><h2>{editingMovie ? 'Edit movie' : 'Add a movie'}</h2></div><Film size={22}/></div>
        {movieError && <div className="auth-error" role="alert">{movieError}</div>}
        <FormField label="Movie title" value={movieForm.title} onChange={(value) => setMovieForm({ ...movieForm, title: value })} required/>
        <FormField label="Synopsis" value={movieForm.synopsis} onChange={(value) => setMovieForm({ ...movieForm, synopsis: value })} required textarea/>
        <FormField label="Poster image URL" value={movieForm.posterUrl} onChange={(value) => setMovieForm({ ...movieForm, posterUrl: value })} required/>
        <FormField label="Backdrop image URL (optional)" value={movieForm.backdropUrl} onChange={(value) => setMovieForm({ ...movieForm, backdropUrl: value })}/>
        <div className="form-row"><FormField label="Genre" value={movieForm.genre} onChange={(value) => setMovieForm({ ...movieForm, genre: value })} required/><FormField label="Runtime (min)" type="number" value={movieForm.duration} onChange={(value) => setMovieForm({ ...movieForm, duration: Number(value) })} required/></div>
        <div className="form-row"><FormField label="Rating" value={movieForm.rating} onChange={(value) => setMovieForm({ ...movieForm, rating: value })}/><FormField label="Language" value={movieForm.language} onChange={(value) => setMovieForm({ ...movieForm, language: value })}/></div>
        <FormField label="Release date (optional)" type="date" value={movieForm.releaseDate} onChange={(value) => setMovieForm({ ...movieForm, releaseDate: value })}/>
        <label className="featured-field"><input type="checkbox" checked={movieForm.featured} onChange={(event) => setMovieForm({ ...movieForm, featured: event.target.checked })}/> Feature this movie</label>
        <button className="button button-primary button-block" disabled={busy}>{busy ? 'Saving?' : editingMovie ? 'Save changes' : 'Add movie'} <ArrowRight size={16}/></button>
        {editingMovie && <button type="button" className="button button-ghost button-block mt-2" disabled={busy} onClick={cancelMovieEdit}>Cancel edit</button>}
      </form>
      <form className="admin-panel" onSubmit={saveTheater}>
        <div className="panel-heading"><div><span>02 / VENUES</span><h2>{editingTheater ? 'Edit theater' : 'Add a theater'}</h2></div><Clapperboard size={22}/></div>
        <FormField label="Theater name" value={theaterForm.name} onChange={(value) => setTheaterForm({ ...theaterForm, name: value })} required/>
        <FormField label="Location" value={theaterForm.location} onChange={(value) => setTheaterForm({ ...theaterForm, location: value })} required/>
        <button className="button button-primary button-block" disabled={busy}>{busy ? 'Saving?' : editingTheater ? 'Save theater' : 'Add theater'}</button>
        {editingTheater && <button type="button" className="button button-ghost button-block mt-2" disabled={busy} onClick={() => { setEditingTheater(''); setTheaterForm({ name: '', location: '' }); }}>Cancel edit</button>}
        <div className="admin-sublist">{theaters.length ? theaters.map((theater) => <div className="admin-list-row" key={theater._id}><div><strong>{theater.name}</strong><span>{theater.location}</span></div><button type="button" className="button button-small button-ghost" disabled={busy} onClick={() => editTheater(theater)}>Edit</button><button type="button" className="delete-button" disabled={busy} onClick={() => deleteTheater(theater)} aria-label={`Delete ${theater.name}`}><X size={17}/></button></div>) : <p className="text-secondary">No theaters yet.</p>}</div>
      </form>
      <form className="admin-panel" onSubmit={saveScreen}>
        <div className="panel-heading"><div><span>03 / AUDITORIUMS</span><h2>{editingScreen ? 'Edit screen' : 'Add a screen'}</h2></div><Armchair size={22}/></div>
        <div className="form-field"><label htmlFor="screen-theater">Theater</label><select id="screen-theater" required value={selectedTheater} onChange={(event) => { setSelectedTheater(event.target.value); if (!editingScreen) setScreenForm({ ...screenForm, name: '', seatCapacity: 60 }); }}><option value="">Select a theater</option>{theaters.map((theater) => <option key={theater._id} value={theater._id}>{theater.name}</option>)}</select></div>
        <FormField label="Screen name or number" value={screenForm.name} onChange={(value) => setScreenForm({ ...screenForm, name: value })} required/>
        <FormField label="Seat capacity (1?260)" type="number" value={screenForm.seatCapacity} onChange={(value) => setScreenForm({ ...screenForm, seatCapacity: Number(value) })} required/>
        <button className="button button-primary button-block" disabled={busy || !selectedTheater}>{busy ? 'Saving?' : editingScreen ? 'Save screen' : 'Add screen'}</button>
        {editingScreen && <button type="button" className="button button-ghost button-block mt-2" disabled={busy} onClick={() => { setEditingScreen(''); setScreenForm({ name: '', seatCapacity: 60 }); }}>Cancel edit</button>}
        <div className="admin-sublist">{screensForTheater.length ? screensForTheater.map((screen) => <div className="admin-list-row" key={screen._id}><div><strong>{screen.name}</strong><span>{screen.seatCapacity} seats</span></div><button type="button" className="button button-small button-ghost" disabled={busy} onClick={() => editScreen(screen)}>Edit</button><button type="button" className="delete-button" disabled={busy} onClick={() => deleteScreen(screen)} aria-label={`Delete ${screen.name}`}><X size={17}/></button></div>) : <p className="text-secondary">Select a theater to view its screens.</p>}</div>
      </form>
      <form className="admin-panel" onSubmit={saveShow}>
        <div className="panel-heading"><div><span>04 / THE SCHEDULE</span><h2>{editingShow ? 'Edit showtime' : 'Schedule a show'}</h2></div><CalendarDays size={22}/></div>
        <div className="form-field"><label htmlFor="show-movie">Movie</label><select id="show-movie" required value={showForm.movie} onChange={(event) => setShowForm({ ...showForm, movie: event.target.value })}><option value="">Select a movie</option>{movies.map((movie) => <option value={movie._id} key={movie._id}>{movie.title}</option>)}</select></div>
        <div className="form-field"><label htmlFor="show-theater">Theater</label><select id="show-theater" required value={showForm.theater} onChange={(event) => { const theater = event.target.value; const firstScreen = screens.find((screen) => theaterIdForScreen(screen) === theater); setShowForm({ ...showForm, theater, screen: firstScreen?._id || '' }); }}><option value="">Select a theater</option>{theaters.map((theater) => <option value={theater._id} key={theater._id}>{theater.name}</option>)}</select></div>
        <div className="form-field"><label htmlFor="show-screen">Screen</label><select id="show-screen" required value={showForm.screen} onChange={(event) => setShowForm({ ...showForm, screen: event.target.value })}><option value="">Select a screen</option>{screensForShowForm.map((screen) => <option value={screen._id} key={screen._id}>{screen.name} ? {screen.seatCapacity} seats</option>)}</select></div>
        <div className="form-row"><FormField label="Date" type="date" value={showForm.date} onChange={(value) => setShowForm({ ...showForm, date: value })} required/><FormField label="Start time" type="time" value={showForm.time} onChange={(value) => setShowForm({ ...showForm, time: value })} required/></div>
        <FormField label="Ticket price ($)" type="number" value={showForm.price} onChange={(value) => setShowForm({ ...showForm, price: Number(value) })} required/>
        <p className="form-hint">Seat layout follows the selected screen capacity. Overlapping times on the same screen are rejected.</p>
        <button className="button button-primary button-block" disabled={busy || !movies.length || !showForm.screen}>{busy ? 'Saving?' : editingShow ? 'Save show changes' : 'Publish showtime'} <ArrowRight size={16}/></button>
        {editingShow && <button type="button" className="button button-ghost button-block mt-2" disabled={busy} onClick={resetShowForm}>Cancel edit</button>}
      </form>
    </div>
    <div className="admin-lists">
      <div className="admin-list-panel"><div className="panel-heading"><div><span>ALL SHOWS · {shows.length}</span><h2>Showtime management</h2></div></div>
        {shows.length ? shows.map((show) => <div className="admin-list-row" key={show._id}><div><strong>{show.movie?.title || 'Movie unavailable'}</strong><span>{show.theater?.name ? `${show.theater.name} · ${show.screen?.name || 'Screen unavailable'}` : `${show.cinema || 'Legacy show'} · legacy screen`}</span><span>{new Date(show.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · {show.time} · $${Number(show.price).toFixed(2)}</span></div><button type="button" className="button button-small button-ghost" disabled={busy} onClick={() => editShow(show)}>Edit</button><button type="button" className="delete-button" disabled={busy} onClick={() => deleteShow(show)} aria-label="Delete show"><X size={17}/></button></div>) : <p className="text-secondary">No shows scheduled.</p>}
      </div>
      <div className="admin-list-panel"><div className="panel-heading"><div><span>MOVIE CATALOG ? {movies.length}</span><h2>Movies</h2></div></div>
        {movies.length ? movies.map((movie) => <div className="admin-list-row" key={movie._id}><img src={movie.posterUrl} alt=""/><div><strong>{movie.title}</strong><span>{movie.genre} ? {movie.duration} min</span></div><button type="button" className="button button-small button-ghost" disabled={busy} onClick={() => beginEditMovie(movie)}>Edit</button><button type="button" className="delete-button" disabled={busy} onClick={() => removeMovie(movie._id)} aria-label={`Delete ${movie.title}`}><X size={17}/></button></div>) : <p className="text-secondary">Your catalog is empty.</p>}
      </div>
    </div>
    <section className="admin-list-panel admin-reports-panel" id="admin-reports" aria-labelledby="admin-reports-title">
      <div className="panel-heading"><div><span>INSIGHTS FROM BOOKING RECORDS</span><h2 id="admin-reports-title">Reports &amp; Analytics</h2></div><CalendarDays size={22}/></div>
      <p className="booking-report-note">Booking value totals the stored amount for all booking records, including cancelled bookings. It is not revenue: this project does not process or record payments.</p>
      <div className="report-metrics">
        <div><span>Total bookings</span><strong>{reports.bookingCounts.total}</strong></div>
        <div><span>Active bookings</span><strong>{reports.bookingCounts.active}</strong></div>
        <div><span>Cancelled bookings</span><strong>{reports.bookingCounts.cancelled}</strong></div>
        <div><span>Total booking value</span><strong>${Number(reports.bookingValue).toFixed(2)}</strong></div>
        <div><span>Actual revenue</span><strong className="report-untracked">Not tracked</strong></div>
      </div>
      <div className="report-details-grid">
        <div className="report-detail-panel"><h3>Most-booked movies</h3><p className="form-hint">Counts booking records, including cancelled bookings.</p>
          {reports.mostBookedMovies.length ? reports.mostBookedMovies.map((movie) => <div className="report-list-row" key={movie.movieId || `missing-${movie.title}`}><span>{movie.title}</span><strong>{movie.bookings} {movie.bookings === 1 ? 'booking' : 'bookings'}</strong></div>) : <p className="report-empty">No booking records yet.</p>}
        </div>
        <div className="report-detail-panel"><h3>Bookings by date</h3><p className="form-hint">Grouped by booking creation date (UTC).</p>
          {reports.bookingsByDate.length ? reports.bookingsByDate.map((day) => <div className="report-date-row" key={day.date}><span>{day.date}</span><div className="report-bar-track"><i style={{ width: `${(day.count / busiestDateCount) * 100}%` }}/></div><strong>{day.count}</strong></div>) : <p className="report-empty">No booking dates to report.</p>}
        </div>
      </div>
    </section>
    <section className="admin-list-panel admin-bookings-panel" aria-labelledby="admin-bookings-title">
      <div className="panel-heading"><div><span>BOOKING DESK ? {bookings.length} RECORD{bookings.length === 1 ? '' : 'S'}</span><h2 id="admin-bookings-title">Customer bookings</h2><p className="form-hint">Payment status is not tracked by this project.</p></div><Ticket size={22}/></div>
      <div className="booking-filter-list" role="group" aria-label="Filter customer bookings">
        {[['all', 'All'], ['active', 'Active'], ['cancelled', 'Cancelled']].map(([filter, label]) => <button key={filter} type="button" className={`booking-filter-button ${bookingFilter === filter ? 'selected' : ''}`} aria-pressed={bookingFilter === filter} onClick={() => setBookingFilter(filter)}>{label}<span>{filter === 'all' ? bookingStats.total : filter === 'active' ? bookingStats.active : bookingStats.cancelled}</span></button>)}
      </div>
      {visibleBookings.length ? visibleBookings.map((booking) => <div className={`admin-list-row admin-booking-row booking-${booking.status || 'active'}`} key={booking.id}>
        <div className="admin-booking-copy"><strong>{booking.movie?.title || 'Movie unavailable'} · {booking.bookingCode}</strong><span>{booking.customer ? `${booking.customer.name} (${booking.customer.email})` : 'Customer unavailable'} · {booking.status}</span><span>{booking.showtime ? `${new Date(booking.showtime.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · ${booking.showtime.time} · ${booking.showtime.theater?.name || booking.showtime.cinema} · ${booking.showtime.screen?.name || 'legacy screen'}` : 'Show unavailable'} · Seats {booking.seats.join(', ')}</span></div>
        <div className="admin-booking-total"><strong>${Number(booking.total).toFixed(2)}</strong><Link className="button button-small button-ghost" to={`/tickets/${booking.id}`}>View Ticket</Link><span>Booking record · payment not tracked</span>{booking.canCancel && booking.status !== 'cancelled' && <button type="button" className="button button-small button-ghost" disabled={busy} onClick={() => cancelBooking(booking)}>{busy ? 'Processing…' : booking.status === 'cancelling' ? 'Retry cancellation' : 'Cancel booking'}</button>}</div>
      </div>) : <p className="text-secondary">{bookings.length ? `No ${bookingFilter} bookings.` : 'No customer bookings yet.'}</p>}
    </section>
  </div></section>;
}

function FormField({ label, value, onChange, type = 'text', required = false, textarea = false }) {
  return <div className="form-field"><label>{label}</label>{textarea ? <textarea rows="3" value={value} onChange={(e) => onChange(e.target.value)} required={required}/> : <input type={type} value={value} onChange={(e) => onChange(e.target.value)} required={required} min={type === 'number' ? 1 : undefined}/>}</div>;
}

function AuthModal({ mode, setMode, onClose }) {
  const { setUser, notify } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event) => { event.preventDefault(); setError(''); setBusy(true); try { const data = await request(`/auth/${mode === 'register' ? 'register' : 'login'}`, { method: 'POST', body: JSON.stringify(form) }); if (mode === 'admin-login' && data.user.role !== 'admin') throw new Error('This account does not have administrator access.'); localStorage.setItem('imovies-token', data.token); setUser(data.user); onClose(); if (data.user.role === 'admin') navigate('/admin'); notify(`Welcome${mode === 'register' ? '' : ' back'}, ${data.user.name.split(' ')[0]}!`); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  return <div className="modal-scrim" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><div className="auth-modal" role="dialog" aria-modal="true" aria-label={mode === 'register' ? 'Create an account' : mode === 'admin-login' ? 'Admin login' : 'Sign in'}><button className="modal-close" onClick={onClose} aria-label="Close"><X/></button><div className="auth-logo"><Clapperboard size={22}/></div><div className="eyebrow muted-eyebrow">LIGHTS, CAMERA, YOU</div><h2>{mode === 'register' ? 'Join the show.' : mode === 'admin-login' ? 'Admin login.' : 'Welcome back.'}</h2><p>{mode === 'register' ? 'Create an account and find your front row.' : mode === 'admin-login' ? 'Sign in with the administrator account configured on the server.' : 'Your next movie night is waiting.'}</p>{error && <div className="auth-error">{error}</div>}<form onSubmit={submit}>{mode === 'register' && <FormField label="Your name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required/>}<FormField label="Email address" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} required/><FormField label="Password" type="password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} required/><button className="button button-primary button-block" disabled={busy}>{busy ? 'One moment…' : mode === 'register' ? 'Create account' : mode === 'admin-login' ? 'Sign in as admin' : 'Sign in'} <ArrowRight size={16}/></button></form><div className="auth-switch">{mode === 'register' ? <>Already have an account? <button onClick={() => { setMode('login'); setError(''); }}>Sign in</button></> : mode === 'admin-login' ? <>Customer account? <button onClick={() => { setMode('login'); setError(''); }}>Customer login</button></> : <>New to iMovies? <button onClick={() => { setMode('register'); setError(''); }}>Create an account</button><br/>Administrator? <button onClick={() => { setMode('admin-login'); setError(''); }}>Admin login</button></>}</div></div></div>;
}

function Footer() {
  return <footer className="site-footer"><div className="container footer-inner"><Link className="brand footer-brand" to="/"><span className="brand-mark"><Clapperboard size={17}/></span><span>i<span className="brand-accent">Movies</span></span></Link><span>Good movies. Great memories.</span><span className="footer-copy">© {new Date().getFullYear()} IMOVIES · MADE FOR THE LOVE OF FILM</span></div></footer>;
}

export default App;
