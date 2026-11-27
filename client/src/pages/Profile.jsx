import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import COUNTRIES from '../data/countries';
import PhoneField, { parsePhone, joinPhone } from '../components/PhoneField';
import AccountSecurity from '../components/AccountSecurity';
import PushSettings from '../components/PushSettings';
import Avatar from '../components/ui/Avatar';
import Icon from '../components/ui/Icon';
import RoleChip from '../components/ui/RoleChip';
import { rolesOf } from '../hooks/usePermissions';
import MyAccount from './MyAccount';

const PARTS = ['Soprano', 'Alto', 'Tenor', 'Bass'];

export default function ProfilePage({ ctx }) {
  const { me, setUsers, toast } = ctx || {};
  const setup = !!ctx?.setup;
  const { user, updateProfile, logout } = useAuth();
  
  const currentUser = me || user || {};
  const initPhone = parsePhone(currentUser.phone, currentUser.country);

  const [form, setForm] = useState({
    name: currentUser.name || '',
    email: currentUser.email || '',
    dob: currentUser.dob || '', 
    country: currentUser.country || '', 
    phoneIso: initPhone.iso,
    phoneNumber: initPhone.num,
    part: currentUser.voice || currentUser.section || '',
  });
  
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState(ctx?.settingsTab || (me?.system ? 'profile' : 'overview'));
  // The sidebar's Security button opens the Security tab even when Settings is already open
  useEffect(() => { if (ctx?.settingsTab) setTab(ctx.settingsTab); }, [ctx?.settingsTab]);
  const upd = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = async () => {
    if (!form.name.trim()) return toast?.('Full name is required.', 'err');
    if (!form.dob) return toast?.('Date of birth is required.', 'err');
    if (!form.country.trim()) return toast?.('Country is required.', 'err');
    
    // [NEW] Phone validation
    if (!form.phoneNumber || form.phoneNumber.length < 7) {
      return toast?.('Please enter a valid phone number (at least 7 digits).', 'err');
    }
    if (!form.part) return toast?.('Please select the part you sing.', 'err');
    
    setSaving(true);
    try {
      // Combine code + number before saving to database
      const fullPhone = joinPhone(form.phoneIso, form.phoneNumber);
      
      const updated = await updateProfile({ 
        name: form.name.trim(), 
        dob: form.dob, 
        country: form.country.trim(), 
        phone: fullPhone, 
        section: form.part 
      });
      
      if (setUsers) {
        setUsers((prev) => prev.map((u) => (u.email === updated.email ? { ...u, ...updated, voice: updated.section || updated.voice } : u)));
      }
      toast?.('Details saved successfully ✅');
    } catch (e) { 
      toast?.(e.message || 'Could not save profile.', 'err'); 
    } finally { 
      setSaving(false); 
    }
  };

  // Uses the site's own form styles (.field, .label, .input, chips, buttons), so it matches every other page and dark mode
  const formBody = (
    <div className="profile-form">
      <div className="grid g2 profile-grid">
        <div className="field"><label className="label" htmlFor="pf-name">Full name</label><input id="pf-name" className="input" value={form.name} onChange={upd('name')} placeholder="Your full name" /></div>
        <div className="field"><label className="label" htmlFor="pf-email">Email address</label><input id="pf-email" className="input" value={form.email} disabled /></div>
        <div className="field"><label className="label" htmlFor="pf-dob">Date of birth</label><input id="pf-dob" className="input" type="date" value={form.dob} onChange={upd('dob')} /></div>
        <div className="field">
          <label className="label" htmlFor="pf-country">Country</label>
          <input id="pf-country" className="input" list="country-list" value={form.country} onChange={upd('country')} placeholder="e.g. Nigeria" />
          <datalist id="country-list">{COUNTRIES.map((c) => <option key={c.iso} value={c.name} />)}</datalist>
        </div>
      </div>
      <div className="field">
        <label className="label" htmlFor="pf-phone">Telephone number</label>
        <PhoneField id="pf-phone" className="input" iso={form.phoneIso} num={form.phoneNumber}
          onIso={(phoneIso) => setForm((f) => ({ ...f, phoneIso }))} onNum={(phoneNumber) => setForm((f) => ({ ...f, phoneNumber }))} />
        <p className="muted tiny" style={{ margin: '6px 0 0' }}>Numbers only — letters and symbols are removed automatically.</p>
      </div>
      <div className="field">
        <label className="label">The part you sing</label>
        <div className="chip-row">
          {PARTS.map((p) => <button key={p} type="button" className={`chip ${form.part === p ? 'on' : ''}`} aria-pressed={form.part === p} onClick={() => setForm((f) => ({ ...f, part: p }))}>{p}</button>)}
        </div>
      </div>
      <div className="profile-actions">
        <button className="btn btn-pri" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save details'}</button>
        {!setup && <button className="btn btn-ghost" onClick={logout}><Icon name="logout" size={14} /> Sign out</button>}
      </div>
    </div>
  );

  if (setup) {
    return (
      <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f4f5f7', padding: '20px' }}>
        <section style={{ width: '100%', maxWidth: '660px', background: '#fff', padding: '32px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <span style={{ display: 'inline-block', background: '#e9a63a22', color: '#b45309', fontSize: '12px', fontWeight: 700, padding: '6px 14px', borderRadius: '999px', marginBottom: '12px' }}>
              First-time setup
            </span>
            <h2 style={{ fontSize: '24px', fontWeight: 700, margin: 0, color: '#1a2c60' }}>Welcome, {form.name.split(' ')[0] || 'Chorister'} 👋</h2>
            <p style={{ color: '#666', marginTop: '8px' }}>We saved your name & email from Google. Complete your details to enter the choir portal.</p>
          </div>
          {formBody}
        </section>
      </main>
    );
  }

  // My Account and Settings in one place. The system admin account is not a member, so it has no Overview.
  // (an @avcsb.com address is a system account, the same rule as the server: known at once, before the member list loads)
  const system = !!currentUser.system || /@avcsb\.com$/i.test(currentUser.email || '');
  const tabs = [...(system ? [] : [['overview', 'Overview']]), ['profile', 'Profile'], ['notifications', 'Notifications'], ['security', 'Security']];
  const shown = tab === 'overview' && system ? 'profile' : tab;
  return (
    <div className="stack settings">
      <div className="page-head"><div><h2>My Account</h2><p className="muted small">Your attendance, dues and duties, your details, and how you sign in.</p></div></div>
      <div className="tab-row" role="tablist">
        {tabs.map(([id, label]) => <button key={id} role="tab" aria-selected={shown === id} className={`tab ${shown === id ? 'on' : ''}`} onClick={() => setTab(id)}>{label}</button>)}
      </div>
      {shown === 'overview' ? <MyAccount ctx={{ ...ctx, setPage: (p) => (p === 'profile' ? setTab('profile') : ctx.setPage(p)) }} /> : shown === 'profile' ? (<>
        <div className="card settings-id">
          <Avatar user={currentUser} size={60} />
          <div style={{ minWidth: 0 }}>
            <h3 style={{ margin: 0 }}>{currentUser.name}</h3>
            <p className="muted small" style={{ margin: '2px 0 8px', overflowWrap: 'anywhere' }}>{currentUser.email}</p>
            <div className="chip-row">{rolesOf({ roles: currentUser.roles || [] }).map((r) => <RoleChip key={r} r={r} />)}</div>
          </div>
        </div>
        <div className="card">
          <div className="card-h"><h3>Personal details</h3></div>
          {formBody}
        </div>
      </>) : shown === 'notifications' ? <PushSettings toast={toast} /> : <AccountSecurity toast={toast} />}
    </div>
  );
}
