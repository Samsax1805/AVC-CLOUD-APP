import React, { useState } from 'react';
import { ToastProvider } from './context/ToastContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DataProvider, useDataContext } from './context/DataContext';
import { isProfileComplete } from './utils/helpers';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import SelectSection from './pages/SelectSection';
import ProfilePage from './pages/Profile';
import AppShell from './components/AppShell';

function Root() {
  const { user } = useAuth();
  const data = useDataContext();
  // [FIX] 'login' | 'register' | 'forgot'
  const [screen, setScreen] = useState('login');

  if (!user) {
    if (screen === 'register') return <Register onSwitch={() => setScreen('login')} />;
    if (screen === 'forgot') return <ForgotPassword onBack={() => setScreen('login')} onDone={() => setScreen('login')} />;
    return <Login onSwitch={() => setScreen('register')} onForgot={() => setScreen('forgot')} />;
  }

  if (user.provider === 'google' && !isProfileComplete(user)) return <ProfilePage ctx={{ ...data, setup: true }} />;
  const isPlainMember = (user.roles || ['member']).every((r) => r === 'member');
  if (!user.section && !user.voice && isPlainMember) return <SelectSection />;
  return <AppShell />;
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <DataProvider>
          <Root />
        </DataProvider>
      </AuthProvider>
    </ToastProvider>
  );
}