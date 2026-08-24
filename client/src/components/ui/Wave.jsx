import React from 'react';
export default function Wave({ seed = 5, active, color = '#8b5cf6' }) {
  return (
    <div className={`wave ${active ? 'on' : ''}`}>
      {Array.from({ length: 34 }).map((_, i) => (
        <span key={i} className="wavebar" style={{ height: `${26 + ((i * 7 + seed * 13) % 62)}%`, background: active ? color : '#ddd6f3', animationDelay: `${(i % 8) * 0.09}s` }} />
      ))}
    </div>
  );
}