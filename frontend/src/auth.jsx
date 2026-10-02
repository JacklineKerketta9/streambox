import { createContext, useContext, useEffect, useState } from 'react';
import { api, refreshSession, setToken } from './api.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore the session from the refresh cookie (also completes Google sign-in redirects).
  useEffect(() => {
    refreshSession()
      .then((data) => setUser(data.user))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const authenticate = async (path, body) => {
    const data = await api(path, { method: 'POST', body });
    setToken(data.accessToken);
    setUser(data.user);
  };

  const value = {
    user,
    loading,
    login: (email, password) => authenticate('/auth/login', { email, password }),
    signup: (email, password, name) => authenticate('/auth/signup', { email, password, name: name || undefined }),
    logout: async () => {
      await api('/auth/logout', { method: 'POST' }).catch(() => {});
      setToken(null);
      setUser(null);
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
