import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export default function Navbar() {
  const { user, logout } = useAuth();
  return (
    <header className="nav">
      <Link to="/" className="logo">STREAMBOX</Link>
      <nav>
        <NavLink to="/" end>Home</NavLink>
        <NavLink to="/find">Search</NavLink>
        <NavLink to="/list">My List</NavLink>
        {user.role === 'admin' && <NavLink to="/studio">Studio</NavLink>}
      </nav>
      <div className="nav-right">
        <span className="muted small">{user.name || user.email}</span>
        <button className="btn ghost sm" onClick={logout}>Sign out</button>
      </div>
    </header>
  );
}
