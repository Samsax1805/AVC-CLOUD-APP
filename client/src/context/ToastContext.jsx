import React, { createContext, useContext, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Icon from '../components/ui/Icon';
const ToastContext = createContext(null);
export const ToastProvider = ({ children }) => {
  const [toastMsg, setToastMsg] = useState(null);
  const timer = useRef(null);
  const toast = (msg, type = 'ok') => { setToastMsg({ msg, type, id: Date.now() }); clearTimeout(timer.current); timer.current = setTimeout(() => setToastMsg(null), 2800); };
  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <AnimatePresence>
        {toastMsg && (
          <motion.div key={toastMsg.id} className={`toast ${toastMsg.type}`} initial={{ opacity: 0, y: 20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20 }}>
            <Icon name={toastMsg.type === 'err' ? 'x' : 'check'} size={15} /> {toastMsg.msg}
          </motion.div>
        )}
      </AnimatePresence>
    </ToastContext.Provider>
  );
};
export const useToast = () => useContext(ToastContext);