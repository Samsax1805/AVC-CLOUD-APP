import React, { createContext, useContext, useState } from 'react';
import api from '../services/api';
import { seedUsers } from '../data/seed';

const AuthContext = createContext(null);
const backendDown = (e) => !e.response || e.response.status >= 500;

// [FIX] Carry profile fields + provider so the app knows Google vs email users
const mapUser = (u) => ({
  id: u.id, name: u.name, email: u.email,
  roles: u.roles && u.roles.length ? u.roles : ['member'],
  section: u.section || null, voice: u.voice || u.section || null,
  avatar: u.avatar || null, dob: u.dob || '', country: u.country || '',
  phone: u.phone || '', provider: u.provider || 'local', joined: u.joined || '',
});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try { const raw = localStorage.getItem('avc_user'); return raw ? JSON.parse(raw) : null; } catch { return null; }
  });

  const finish = (u, token) => { if (token) localStorage.setItem('avc_token', token); localStorage.setItem('avc_user', JSON.stringify(u)); setUser(u); return u; };

  const login = async (email, pass) => {
    try { const { data } = await api.post('/auth/login', { email, password: pass }); return finish(mapUser(data.user), data.access); }
    catch (e) {
      if (!backendDown(e)) throw new Error(e.response?.data?.msg || 'Invalid credentials');
      const u = seedUsers.find((x) => x.email === (email || '').toLowerCase());
      if (!u || u.pass !== pass) throw new Error('Invalid credentials (backend offline)');
      return finish(mapUser(u), null);
    }
  };

  const demoLogin = async (email) => {
    try { const { data } = await api.post('/auth/demo', { email }); return finish(mapUser(data.user), data.access); }
    catch (e) {
      if (!backendDown(e)) throw new Error(e.response?.data?.msg || 'Demo failed');
      const u = seedUsers.find((x) => x.email === email);
      if (!u) throw new Error('Demo account not found');
      return finish(mapUser(u), null);
    }
  };

  const googleLogin = async (credential) => {
    try { const { data } = await api.post('/auth/google', { credential }); return finish(mapUser(data.user), data.access); }
    catch (e) {
      if (!backendDown(e)) throw new Error(e.response?.data?.msg || 'Google sign-in failed');
      try {
        const p = JSON.parse(atob(String(credential).split('.')[1]));
        return finish({ id: 'g-' + p.sub, name: p.name, email: p.email, roles: ['member'], section: null, avatar: p.picture, provider: 'google' }, null);
      } catch {
        return finish({ id: 'g-sandbox', name: 'Google Chorister', email: 'google.chorister@gmail.com', roles: ['member'], section: null, avatar: null, provider: 'google' }, null);
      }
    }
  };

  const sandboxLogin = () => finish({ id: 'g-sandbox', name: 'Google Chorister', email: 'google.chorister@gmail.com', roles: ['member'], section: null, avatar: null, provider: 'google' }, null);

  // [NEW] Save profile details (name, dob, country, phone, section)
  const updateProfile = async (patch) => {
    try {
      const { data } = await api.patch('/auth/profile', patch);
      const u = mapUser(data.user);
      localStorage.setItem('avc_user', JSON.stringify(u)); setUser(u); return u;
    } catch (e) {
      if (e.response) throw new Error(e.response.data?.msg || 'Update failed');
      const next = { ...user, ...patch, voice: patch.section || user?.voice, section: patch.section || user?.section };
      localStorage.setItem('avc_user', JSON.stringify(next)); setUser(next); return next;
    }
  };

  // New members wait for approval by the President or Provost — no login until then
  const register = async (payload) => {
    try {
      const { data } = await api.post('/auth/register', payload);
      return data;
    } catch (e) {
      if (!backendDown(e)) throw new Error(e.response?.data?.msg || 'Registration failed');
      throw new Error('The server is unreachable — please try again in a moment.');
    }
  };

  const setSection = async (section) => {
    try { const { data } = await api.post('/auth/section', { section }); const u = mapUser(data.user); localStorage.setItem('avc_user', JSON.stringify(u)); setUser(u); return u; }
    catch (e) { const next = { ...user, section, voice: section }; localStorage.setItem('avc_user', JSON.stringify(next)); setUser(next); return next; }
  };

  const logout = () => { localStorage.removeItem('avc_token'); localStorage.removeItem('avc_user'); setUser(null); };

  return <AuthContext.Provider value={{ user, login, demoLogin, googleLogin, sandboxLogin, register, setSection, updateProfile, logout }}>{children}</AuthContext.Provider>;
};
export const useAuth = () => useContext(AuthContext);