import React, { useState } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export default function Register({ onSwitch }) {
  const { register, startGoogleLogin } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState({ name: '', phone: '', email: '', password: '' });
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const update = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.phone || !form.email || !form.password) return toast('All fields are required.', 'err');
    setLoading(true);
    try {
      await register(form);
      toast('Registration submitted for administrative approval.');
      onSwitch();
    } catch (err) { toast(err.response?.data?.msg || err.message || 'Registration failed.', 'err'); }
    finally { setLoading(false); }
  };

  return (
    <main className="reg-screen">
      <section className="reg-card">
        <h1 className="reg-title">Register</h1>
        <form onSubmit={submit} className="auth-form">
          <label className="label light" htmlFor="reg-name">Name</label>
          <input id="reg-name" className="input" value={form.name} onChange={update('name')} placeholder="Enter your full name" />
          <label className="label light" htmlFor="reg-phone">Phone Number</label>
          <input id="reg-phone" className="input" value={form.phone} onChange={update('phone')} placeholder="Enter your phone number" />
          <label className="label light" htmlFor="reg-email">Email address</label>
          <input id="reg-email" type="email" className="input" value={form.email} onChange={update('email')} placeholder="Enter your email address" />
          <label className="label light" htmlFor="reg-pass">Password</label>
          <div className="relative">
            <input id="reg-pass" className="input" type={show ? 'text' : 'password'} value={form.password} onChange={update('password')} placeholder="Enter your password" style={{ paddingRight: 38 }} />
            <button type="button" className="eye-btn dark" aria-label="Toggle password visibility" onClick={() => setShow((v) => !v)}>{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
          </div>
          <button className="btn-slate" type="submit" disabled={loading}>{loading && <Loader2 size={16} className="spin" />} Register</button>
        </form>
        <div className="my-3 text-center text-sm text-white">or continue with</div>
        <button className="btn-google2" type="button" onClick={() => startGoogleLogin({ email: 'google.chorister@gmail.com', name: 'Google Chorister', avatarUrl: null, googleId: 'sandbox-' + Date.now() })}>
          <svg aria-hidden="true" viewBox="0 0 24 24" className="g-mark"><path fill="#4285F4" d="M21.35 12.23c0-.79-.07-1.55-.22-2.27H12v4.3h5.24a4.48 4.48 0 0 1-1.94 2.94v2.45h3.14c1.84-1.7 2.91-4.2 2.91-7.42Z" /><path fill="#34A853" d="M12 21.7c2.63 0 4.84-.87 6.45-2.36l-3.14-2.45c-.87.58-1.98.92-3.31.92-2.54 0-4.69-1.72-5.46-4.03H3.3v2.53A9.74 9.74 0 0 0 12 21.7Z" /><path fill="#FBBC05" d="M6.54 13.78A5.85 5.85 0 0 1 6.23 12c0-.62.11-1.22.31-1.78V7.69H3.3A9.73 9.73 0 0 0 2.27 12c0 1.57.38 3.05 1.03 4.31l3.24-2.53Z" /><path fill="#EA4335" d="M12 6.19c1.43 0 2.71.49 3.72 1.45l2.79-2.79C16.84 3.28 14.63 2.3 12 2.3a9.74 9.74 0 0 0-8.7 5.39l3.24 2.53c.77-2.31 2.92-4.03 5.46-4.03Z" /></svg>
        </button>
        <p className="reg-foot">Already have an account? <button className="reg-link" onClick={onSwitch}>Sign in</button></p>
      </section>
    </main>
  );
}