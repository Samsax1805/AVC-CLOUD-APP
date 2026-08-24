import React, { createContext, useContext, useState } from 'react';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import {
  demoUsers,
  mockSongs,
  mockMinutes,
  mockAttendance,
  mockDebts,
  mockDues,
  mockElections,
  mockAnnouncements,
} from '../data/mockData';

const DataContext = createContext(null);

export const DataProvider = ({ children }) => {
  const { user } = useAuth();
  const { toast } = useToast();

  // Local state for all data
  const [songs, setSongs] = useState(mockSongs);
  const [minutes, setMinutes] = useState(mockMinutes);
  const [attendance, setAttendance] = useState(mockAttendance);
  const [debts, setDebts] = useState(mockDebts);
  const [dues, setDues] = useState(mockDues);
  const [elections, setElections] = useState(mockElections);
  const [announcements, setAnnouncements] = useState(mockAnnouncements);
  const [members] = useState(demoUsers);

  // Current user from demo users
  const me = members.find(m => m.email === user?.email) || user;

  const log = (action, detail) => {
    console.log(`[AUDIT] ${action}: ${detail}`);
  };

  const notify = (text) => {
    toast(text);
  };

  const value = {
    me,
    members,
    songs,
    setSongs,
    minutes,
    setMinutes,
    attendance,
    setAttendance,
    debts,
    setDebts,
    dues,
    setDues,
    elections,
    setElections,
    announcements,
    setAnnouncements,
    log,
    notify,
    toast,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};

export const useDataContext = () => useContext(DataContext);