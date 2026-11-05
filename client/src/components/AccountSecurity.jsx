import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { Tag, METHOD, when } from '../pages/Security';

const card = { background: '#fff', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', marginTop: '24px' };
const inputStyle = { width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '14px', boxSizing: 'border-box' };
const labelStyle = { display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '14px', color: '#333' };
const btn = (primary) => ({ padding: '10px 20px', background: primary ? '#1a2c60' : '#f0f0f0', border: primary ? 'none' : '1px solid #ddd', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', fontSize: '14px', color: primary ? '#fff' : '#333' });

// Settings → Security: your recent sign-ins, change password, sign out other devices
export default function AccountSecurity({ toast }) {
  const [info, setInfo] = useState(null);
  const [pw, setPw] = useState({ current: '', next: '', again: '' });
  const [busy, setBusy] = useState(false);
  const load = () => api.get('/security/me').then(({ data }) => setInfo(data)).catch(() => setInfo({ failed: true }));
  useEffect(() => { load(); }, []);

  // The server ends every other session and gives this device a fresh login
  const keep = (access) => { if (access) localStorage.setItem('avc_token', access); };

  const changePassword = async () => {
    if (pw.next.length < 6) return toast?.('The new password must be at least 6 characters', 'err');
    if (pw.next !== pw.again) return toast?.('The two new passwords do not match', 'err');
    setBusy(true);
    try {
      const { data } = await api.post('/security/me/password', { current: pw.current, next: pw.next });
      keep(data.access);
      setPw({ current: '', next: '', again: '' });
      toast?.('Password saved. Your other devices have been signed out.');
      load();
    } catch (e) { toast?.(e.response?.data?.msg || 'Could not change the password', 'err'); } finally { setBusy(false); }
  };
  const signOutOthers = async () => {
    setBusy(true);
    try {
      const { data } = await api.post('/security/me/signout-others');
      keep(data.access);
      toast?.('Signed out of all your other devices');
    } catch (e) { toast?.(e.response?.data?.msg || 'That did not work — please try again', 'err'); } finally { setBusy(false); }
  };

  return (
    <div id="account-security" style={card}>
      <h3 style={{ marginTop: 0, marginBottom: '16px', color: '#333' }}>Security</h3>

      <div style={{ marginBottom: '20px' }}>
        <div style={labelStyle}>Your recent sign-ins</div>
        {!info && <p style={{ color: '#888', fontSize: '13px', margin: 0 }}>Loading…</p>}
        {info?.failed && <p style={{ color: '#888', fontSize: '13px', margin: 0 }}>Could not load your sign-ins.</p>}
        {info?.signins && !info.signins.length && <p style={{ color: '#888', fontSize: '13px', margin: 0 }}>None recorded yet — they appear from your next sign-in.</p>}
        {info?.signins?.map((e) => (
          <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', padding: '8px 0', borderBottom: '1px solid #f0e9da', fontSize: '13px' }}>
            <div><Tag type={e.type} /> <span style={{ color: '#555' }}>{[METHOD[e.method], e.device].filter(Boolean).join(' · ')}</span></div>
            <span style={{ color: '#888', whiteSpace: 'nowrap' }}>{when(e.createdAt)}</span>
          </div>
        ))}
        <p style={{ color: '#888', fontSize: '12px', margin: '8px 0 0' }}>See a sign-in that wasn't you? Change your password below.</p>
      </div>

      {info && !info.failed && (
        <div style={{ marginBottom: '20px' }}>
          <div style={labelStyle}>{info.hasPassword ? 'Change password' : 'Set a password'}</div>
          {!info.hasPassword && <p style={{ color: '#666', fontSize: '13px', marginTop: 0 }}>You sign in with Google. A password lets you sign in with your email too.</p>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: '10px' }}>
            {info.hasPassword && <input type="password" autoComplete="current-password" aria-label="Current password" placeholder="Current password" value={pw.current} onChange={({ target: { value } }) => setPw((p) => ({ ...p, current: value }))} style={inputStyle} />}
            <input type="password" autoComplete="new-password" aria-label="New password" placeholder="New password" value={pw.next} onChange={({ target: { value } }) => setPw((p) => ({ ...p, next: value }))} style={inputStyle} />
            <input type="password" autoComplete="new-password" aria-label="New password again" placeholder="New password again" value={pw.again} onChange={({ target: { value } }) => setPw((p) => ({ ...p, again: value }))} style={inputStyle} />
          </div>
          <button onClick={changePassword} disabled={busy} style={{ ...btn(true), marginTop: '10px' }}>{busy ? 'Saving…' : 'Save password'}</button>
        </div>
      )}

      <div>
        <div style={labelStyle}>Other devices</div>
        <p style={{ color: '#666', fontSize: '13px', marginTop: 0 }}>Signed in on a phone or computer you no longer use? This signs out everywhere except here.</p>
        <button onClick={signOutOthers} disabled={busy} style={btn(false)}>Sign out of other devices</button>
      </div>
    </div>
  );
}
