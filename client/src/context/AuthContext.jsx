import React, { createContext, useContext, useState } from 'react';
import { demoUsers } from '../data/mockData';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('avc_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const login = async (email, password) => {
    const found = demoUsers.find(u => u.email === email && u.pass === password);
    if (!found) throw new Error('Invalid credentials. Try: admin@choircloud.com / demo123');
    const userData = { id: found.id, name: found.name, email: found.email, roles: found.roles, voice: found.voice };
    localStorage.setItem('avc_user', JSON.stringify(userData));
    setUser(userData);
    return userData;
  };

  const register = async (formData) => {
    // Mock registration - just return success
    return { success: true, message: 'Registration submitted for approval' };
  };

  const googleLogin = async (profile) => {
    // Mock Google login
    const userData = {
      id: 'g-' + Date.now(),
      name: profile.name || 'Google User',
      email: profile.email,
      roles: ['member'],
      voice: null,
    };
    localStorage.setItem('avc_user', JSON.stringify(userData));
    setUser(userData);
    return userData;
  };

  const setSection = async (section) => {
    const updated = { ...user, voice: section };
    localStorage.setItem('avc_user', JSON.stringify(updated));
    setUser(updated);
  };

  const logout = () => {
    localStorage.removeItem('avc_user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, register, googleLogin, setSection, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);