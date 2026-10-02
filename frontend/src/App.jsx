import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import { ListProvider } from './lists.jsx';
import Navbar from './components/Navbar.jsx';
import Login from './pages/Login.jsx';
import Home from './pages/Home.jsx';
import Find from './pages/Find.jsx';
import MyList from './pages/MyList.jsx';
import Watch from './pages/Watch.jsx';
import Studio from './pages/Studio.jsx';

function Protected() {
  const { user, loading } = useAuth();
  if (loading) return <div className="center muted">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <ListProvider>
      <Navbar />
      <main>
        <Outlet />
      </main>
    </ListProvider>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Protected />}>
        <Route path="/" element={<Home />} />
        <Route path="/find" element={<Find />} />
        <Route path="/list" element={<MyList />} />
        <Route path="/watch/:id" element={<Watch />} />
        <Route path="/studio" element={<Studio />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
