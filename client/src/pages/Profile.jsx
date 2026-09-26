import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

const PARTS = ['Soprano', 'Alto', 'Tenor', 'Bass'];

// [UPDATED] Added DR Congo, Sierra Leone, Tanzania, Mozambique, and Cameroon
const COUNTRIES = [
  'Nigeria', 'Ghana', 'Kenya', 'South Africa', 
  'DR Congo', 'Sierra Leone', 'Tanzania', 'Mozambique', 'Cameroon', 
  'United Kingdom', 'United States', 'Canada', 'Other'
];

// [UPDATED] Added the new country codes with their flags
const PHONE_CODES = [
  { code: '+234', label: '🇳🇬 +234 (NG)' },
  { code: '+243', label: '🇨🇩 +243 (CD)' }, // DR Congo
  { code: '+232', label: '🇸🇱 +232 (SL)' }, // Sierra Leone
  { code: '+255', label: '🇹🇿 +255 (TZ)' }, // Tanzania
  { code: '+258', label: '🇲🇿 +258 (MZ)' }, // Mozambique
  { code: '+237', label: '🇨🇲 +237 (CM)' }, // Cameroon
  { code: '+233', label: '🇬🇭 +233 (GH)' },
  { code: '+254', label: '🇰🇪 +254 (KE)' },
  { code: '+27',  label: '🇿🇦 +27 (ZA)' },
  { code: '+1',   label: '🇺🇸/🇨🇦 +1 (US/CA)' },
  { code: '+44',  label: '🇬🇧 +44 (UK)' },
];

// Helper to split an existing phone number into code + digits
const parsePhone = (raw) => {
// ... keep the rest of the file exactly the same below this line! ...
  if (!raw) return { code: '+234', num: '' };
  const match = PHONE_CODES.find(c => raw.startsWith(c.code));
  if (match) return { code: match.code, num: raw.replace(match.code, '').replace(/\D/g, '') };
  return { code: '+234', num: raw.replace(/\D/g, '') }; 
};

export default function ProfilePage({ ctx }) {
  const { me, setUsers, toast } = ctx || {};
  const setup = !!ctx?.setup;
  const { user, updateProfile, logout } = useAuth();
  
  const currentUser = me || user || {};
  const initPhone = parsePhone(currentUser.phone);

  const [form, setForm] = useState({
    name: currentUser.name || '',
    email: currentUser.email || '',
    dob: currentUser.dob || '', 
    country: currentUser.country || '', 
    phoneCode: initPhone.code,
    phoneNumber: initPhone.num,
    part: currentUser.voice || currentUser.section || '',
  });
  
  const [saving, setSaving] = useState(false);
  const upd = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  // [NEW] Strips all letters/symbols and limits to 15 digits
  const handlePhoneNumChange = (e) => {
    const clean = e.target.value.replace(/\D/g, '').slice(0, 15);
    setForm({ ...form, phoneNumber: clean });
  };

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
      const fullPhone = `${form.phoneCode}${form.phoneNumber}`;
      
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

  const inputStyle = { width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '14px', boxSizing: 'border-box' };
  const labelStyle = { display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '14px', color: '#333' };

  const formBody = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
        
        <div>
          <label style={labelStyle}>Full name</label>
          <input value={form.name} onChange={upd('name')} placeholder="Your full name" style={inputStyle} />
        </div>
        
        <div>
          <label style={labelStyle}>Email address</label>
          <input value={form.email} disabled style={{ ...inputStyle, background: '#f5f5f5', color: '#666' }} />
        </div>
        
        <div>
          <label style={labelStyle}>Date of birth</label>
          <input type="date" value={form.dob} onChange={upd('dob')} style={inputStyle} />
        </div>
        
        <div>
          <label style={labelStyle}>Country</label>
          <input list="country-list" value={form.country} onChange={upd('country')} placeholder="e.g. Nigeria" style={inputStyle} />
          <datalist id="country-list">{COUNTRIES.map((c) => <option key={c} value={c} />)}</datalist>
        </div>
        
        {/* [NEW] Phone Number with Country Code & Validation */}
        <div style={{ gridColumn: 'span 2' }}>
          <label style={labelStyle}>Telephone number</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <select 
              value={form.phoneCode} 
              onChange={upd('phoneCode')} 
              style={{ ...inputStyle, width: '140px', flexShrink: 0, cursor: 'pointer' }}
            >
              {PHONE_CODES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
            </select>
            <input 
              type="tel" 
              value={form.phoneNumber} 
              onChange={handlePhoneNumChange} 
              placeholder="8012345678" 
              style={{ ...inputStyle, flex: 1, letterSpacing: '1px' }} 
            />
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#888' }}>
            Numbers only. Letters and symbols are automatically removed.
          </p>
        </div>

        <div style={{ gridColumn: 'span 2' }}>
          <label style={labelStyle}>The part you sing</label>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', paddingTop: '4px' }}>
            {PARTS.map((p) => (
              <button 
                key={p} 
                type="button" 
                onClick={() => setForm({ ...form, part: p })}
                style={{
                  padding: '10px 20px', borderRadius: '20px', border: '1px solid #ccc', cursor: 'pointer', fontSize: '14px',
                  background: form.part === p ? '#1a2c60' : '#fff',
                  color: form.part === p ? '#fff' : '#333',
                  fontWeight: form.part === p ? 600 : 400,
                  transition: 'all 0.2s'
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '12px', marginTop: '16px', flexWrap: 'wrap' }}>
        <button onClick={save} disabled={saving} style={{ padding: '12px 28px', background: '#e9a63a', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', fontSize: '15px', color: '#fff' }}>
          {saving ? 'Saving…' : 'Save details'}
        </button>
        {!setup && (
          <button onClick={logout} style={{ padding: '12px 28px', background: '#f0f0f0', border: '1px solid #ddd', borderRadius: '6px', cursor: 'pointer', fontSize: '15px', color: '#333' }}>
            Sign out
          </button>
        )}
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

  return (
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
      <h2 style={{ marginBottom: '24px', color: '#1a2c60' }}>My Profile</h2>
      
      <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', marginBottom: '24px', display: 'flex', gap: '16px', alignItems: 'center' }}>
        <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#1a2c60', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', fontWeight: 700, flexShrink: 0 }}>
          {currentUser.name?.charAt(0) || 'U'}
        </div>
        <div>
          <h3 style={{ margin: 0, color: '#333' }}>{currentUser.name}</h3>
          <p style={{ color: '#666', margin: '4px 0 0 0' }}>{currentUser.email}</p>
        </div>
      </div>

      <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <h3 style={{ marginTop: 0, marginBottom: '20px', color: '#333' }}>Personal details</h3>
        {formBody}
      </div>
    </div>
  );
}