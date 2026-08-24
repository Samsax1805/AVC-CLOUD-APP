import React from 'react';
export default function Avatar({ user, size = 34 }) {
  return (
    <div className="avatar" style={{ width: size, height: size, background: user?.color || '#7c3aed', fontSize: size * 0.38 }}>
      {user ? user.name.split(' ').map((w) => w[0]).slice(0, 2).join('') : '?'}
    </div>
  );
}