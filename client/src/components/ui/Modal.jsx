import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Icon from './Icon';
export default function Modal({ open, onClose, title, children, wide }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="modal-bg" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
          <motion.div className={`modal ${wide ? 'wide' : ''}`} initial={{ scale: 0.94, y: 14 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 14 }} onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-h"><h3>{title}</h3><button className="icon-btn" onClick={onClose}><Icon name="x" size={16} /></button></div>
            <div className="modal-b">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}