import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './auth.jsx';
import './styles.css';

// No <React.StrictMode> on purpose: its double-invoked effects would fire two session
// refreshes with the same cookie, which the backend treats as refresh-token reuse.
createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <AuthProvider>
      <App />
    </AuthProvider>
  </BrowserRouter>
);
