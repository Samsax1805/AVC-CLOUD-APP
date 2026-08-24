import React, { useState } from 'react';
import { ToastProvider } from './context/ToastContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DataProvider } from './context/DataContext';
import Login from './pages/Login';
import Register from './pages/Register';
import SelectSection from './pages/SelectSection';
import AppShell from './components/AppShell';

function Root() {
  const { user } = useAuth();
  const [screen, setScreen] = useState('login');

  if (!user) {
    return screen === 'register' 
      ? <Register onSwitch={() => setScreen('login')} /> 
      : <Login onSwitch={() => setScreen('register')} />;
  }
  
  if (!user.voice) return <SelectSection />;
  
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