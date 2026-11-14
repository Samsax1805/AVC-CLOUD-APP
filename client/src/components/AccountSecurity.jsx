import React, { useEffect, useState } from 'react';
import api from '../services/api';
import Icon from './ui/Icon';
import { Tag, METHOD, when } from '../pages/Security';

const Status = ({ on, yes, no }) => (
  <span className="act-tag" style={on ? { background: '#0596691a', color: '#059669' } : { background: '#64748b1a', color: '#64748b' }}>{on ? yes : no}</span>
);

// Settings → Security: how you sign in, your password, your devices and your recent sign-ins
export default function AccountSecurity({ toast }) {
  const [info, setInfo] = useState(null);
  const [pw, setPw] = useState({ current: '', next: '', again: '' });
  const [busy, setBusy] = useState(false);
  const load = () => api.get('/security/me').then(({ data }) => setInfo(data)).catch(() => setInfo({ failed: true }));
  useEffect(() => { load(); }, []);

  // The server ends every other session and gives this device a fresh login
  const keep = (access) => { if (access) localStorage.setItem('avc_token', access); };
  const field = (k) => ({ value: pw[k], onChange: ({ target: { value } }) => setPw((p) => ({ ...p, [k]: value })) });

  const changePassword = async (e) => {
    e.preventDefault();
    if (pw.next.length < 6) return toast?.('The new password must be at least 6 characters', 'err');
    if (pw.next !== pw.again) return toast?.('The two new passwords do not match', 'err');
    setBusy(true);
    try {
      const { data } = await api.post('/security/me/password', { current: pw.current, next: pw.next });
      keep(data.access);
      setPw({ current: '', next: '', again: '' });
      toast?.('Password saved. Your other devices have been signed out.');
      load();
    } catch (err) { toast?.(err.response?.data?.msg || 'Could not change the password', 'err'); } finally { setBusy(false); }
  };
  const signOutOthers = async () => {
    setBusy(true);
    try {
      const { data } = await api.post('/security/me/signout-others');
      keep(data.access);
      toast?.('Signed out of all your other devices');
    } catch (err) { toast?.(err.response?.data?.msg || 'That did not work — please try again', 'err'); } finally { setBusy(false); }
  };

  if (!info) return <div className="card"><p className="muted small" style={{ margin: 0 }}>Loading your security settings…</p></div>;
  if (info.failed) return <div className="card"><p className="small" style={{ margin: 0 }}>Your security settings could not be loaded. <button className="btn btn-sm btn-soft" onClick={load}>Try again</button></p></div>;

  return (
    <div className="stack" id="account-security">
      <div className="card">
        <div className="card-h"><h3>Sign-in methods</h3></div>
        <div className="set-row">
          <div><b className="small">Google</b><div className="muted tiny">Sign in with your Google account</div></div>
          <Status on={info.google} yes="Connected" no="Not used" />
        </div>
        <div className="set-row">
          <div><b className="small">Password</b><div className="muted tiny">Sign in with your email and a password</div></div>
          <Status on={info.hasPassword} yes="Set" no="Not set" />
        </div>
      </div>

      <form className="card" onSubmit={changePassword}>
        <div className="card-h"><h3>{info.hasPassword ? 'Change password' : 'Set a password'}</h3></div>
        <p className="muted small" style={{ marginTop: 0 }}>
          {info.hasPassword ? 'Use at least 6 characters. Saving signs you out on your other devices.' : 'You sign in with Google. A password also lets you sign in with your email.'}
        </p>
        <div className="grid g3 set-grid">
          {info.hasPassword && <div className="field"><label className="label" htmlFor="pw-cur">Current password</label><input id="pw-cur" className="input" type="password" autoComplete="current-password" {...field('current')} /></div>}
          <div className="field"><label className="label" htmlFor="pw-new">New password</label><input id="pw-new" className="input" type="password" autoComplete="new-password" {...field('next')} /></div>
          <div className="field"><label className="label" htmlFor="pw-again">Confirm new password</label><input id="pw-again" className="input" type="password" autoComplete="new-password" {...field('again')} /></div>
        </div>
        <div style={{ marginTop: 14 }}><button className="btn btn-pri" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button></div>
      </form>

      <div className="card">
        <div className="card-h"><h3>Devices</h3></div>
        <div className="set-row">
          <div><b className="small">Sign out of other devices</b><div className="muted tiny">Lost a phone, or signed in on someone else's computer? This keeps you signed in here only.</div></div>
          <button className="btn btn-sm btn-soft" disabled={busy} onClick={signOutOthers}><Icon name="logout" size={13} /> Sign out others</button>
        </div>
      </div>

      <div className="card">
        <div className="card-h"><h3>Recent sign-in activity</h3></div>
        {info.signins.length ? (
          <div className="feed">
            {info.signins.map((e) => (
              <div className="feed-row" key={e.id}>
                <div className="feed-txt"><Tag type={e.type} /> <span className="small">{[METHOD[e.method], e.device].filter(Boolean).join(' · ')}</span>{e.ip && <div className="muted tiny">Network {e.ip}</div>}</div>
                <span className="muted tiny">{when(e.createdAt)}</span>
              </div>
            ))}
          </div>
        ) : <p className="muted small" style={{ margin: 0 }}>No sign-ins recorded yet — they appear from your next sign-in.</p>}
        <p className="muted tiny" style={{ marginBottom: 0 }}>Don't recognise a sign-in? Change your password and sign out of other devices.</p>
      </div>
    </div>
  );
}
