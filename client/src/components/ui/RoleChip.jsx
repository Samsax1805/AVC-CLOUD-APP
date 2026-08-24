import React from 'react';
import { ROLES } from '../../hooks/usePermissions';
export default function RoleChip({ r, small }) {
  return (
    <span className={`role-badge ${small ? 'small' : ''}`} style={{ background: ROLES[r].bg, color: ROLES[r].color }}>
      {ROLES[r].label}
    </span>
  );
}