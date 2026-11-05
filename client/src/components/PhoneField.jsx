import React from 'react';
import COUNTRIES from '../data/countries';

// Countries sharing a calling code: which one to show when the number alone can't tell
const MAIN_FOR_CODE = {
  '+1': 'US', '+7': 'RU', '+39': 'IT', '+44': 'GB', '+47': 'NO', '+61': 'AU',
  '+212': 'MA', '+262': 'RE', '+290': 'SH', '+358': 'FI', '+590': 'GP', '+599': 'CW',
};
const DEFAULT_ISO = 'NG';

const byIso = (iso) => COUNTRIES.find((c) => c.iso === iso);
const flagOf = (iso) => String.fromCodePoint(...[...iso].map((c) => 0x1f1a5 + c.charCodeAt(0)));

// Longest first, so a number is never matched by a shorter code that happens to fit
const DIALS = [...new Set(COUNTRIES.map((c) => c.dial))].sort((a, b) => b.length - a.length);

// Splits a saved number into country + digits. Numbers saved without a code keep all their digits.
export const parsePhone = (raw, countryName = '') => {
  const named = COUNTRIES.find((c) => c.name.toLowerCase() === String(countryName).trim().toLowerCase());
  const compact = String(raw || '').replace(/[^\d+]/g, '').replace(/^00/, '+');
  const dial = compact.startsWith('+') && DIALS.find((d) => compact.startsWith(d));
  if (!dial) return { iso: named?.iso || DEFAULT_ISO, num: compact.replace(/\D/g, '') };
  const iso = named?.dial === dial ? named.iso : MAIN_FOR_CODE[dial] || COUNTRIES.find((c) => c.dial === dial).iso;
  return { iso, num: compact.slice(dial.length) };
};

export const joinPhone = (iso, num) => `${byIso(iso).dial}${num}`;

export default function PhoneField({ iso, num, onIso, onNum, id, className, style, placeholder = '8012345678' }) {
  return (
    <div style={{ display: 'flex', gap: '8px', width: '100%', minWidth: 0 }}>
      <div className="phone-code" style={{ position: 'relative', flexShrink: 0, width: '112px' }}>
        <div className={className} aria-hidden="true" style={{ ...style, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', whiteSpace: 'nowrap' }}>
          <span>{flagOf(iso)} {byIso(iso).dial}</span><span style={{ fontSize: '10px', opacity: 0.6 }}>▼</span>
        </div>
        <select
          aria-label="Country calling code"
          value={iso}
          onChange={(e) => onIso(e.target.value)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', fontSize: '16px' }}
        >
          {COUNTRIES.map((c) => <option key={c.iso} value={c.iso}>{c.name} ({c.dial}) {flagOf(c.iso)}</option>)}
        </select>
      </div>
      <input
        id={id}
        type="tel"
        inputMode="numeric"
        className={className}
        value={num}
        onChange={(e) => onNum(e.target.value.replace(/\D/g, '').slice(0, 15))}
        placeholder={placeholder}
        style={{ ...style, flex: 1, minWidth: 0, width: 'auto', letterSpacing: '1px' }}
      />
    </div>
  );
}
