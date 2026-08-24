import React, { createContext, useContext, useState } from 'react';
import { seedUsers } from '../data/seed';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);

  const login = async (email, pass) => {
    const u = (seedUsers || []).find((x) => x.email === (email || '').toLowerCase());
    if (!u || u.pass !== pass) throw new Error('Invalid credentials. Use password: demo123');
    setUser(u); return u;
  };
  const demoLogin = async (email) => { const u = (seedUsers || []).find((x) => x.email === email); if (u) setUser(u); return u; };
  const googleLogin = async (p) => { const u = { id: 'g1', name: p?.name || 'Google Chorister', email: p?.email || 'google@avc.local', roles: ['member'], voice: null, color: '#475569' }; setUser(u); return u; };
  const register = async () => ({ success: true });
  const setSection = async (section) => setUser((u) => (u ? { ...u, voice: section } : u));
  const logout = () => setUser(null);

  return <AuthContext.Provider value={{ user, login, demoLogin, googleLogin, register, setSection, logout }}>{children}</AuthContext.Provider>;
};
export const useAuth = () => useContext(AuthContext);
