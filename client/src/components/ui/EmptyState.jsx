import React from 'react';
import Icon from './Icon';
export default function EmptyState({ icon, text }) {
  return <div className="empty"><Icon name={icon} size={26} /><p>{text}</p></div>;
}