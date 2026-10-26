import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, setUnauthorizedHandler } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined while loading
  const [sessionExpired, setSessionExpired] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const { user } = await api.get('/auth/me');
      setUser(user);
      return user;
    } catch {
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser((prev) => {
        if (prev) setSessionExpired(true);
        return null;
      });
    });
  }, []);

  const login = async (email, password) => {
    const { user } = await api.post('/auth/login', { email, password });
    setSessionExpired(false);
    setUser(user);
    return user;
  };

  const logout = async () => {
    await api.post('/auth/logout').catch(() => {});
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, refresh, login, logout, sessionExpired, setSessionExpired }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
