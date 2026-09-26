import React, { useState } from 'react';
import { Mail, KeyRound, Lock, ArrowLeft, Loader2, CheckCircle2 } from 'lucide-react';
import api from '../services/api';

export default function ForgotPassword({ onBack, onDone }) {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const clearErr = () => setError('');

  const sendCode = async (e) => {
    e.preventDefault(); clearErr();
    if (!email.trim()) return setError('Please enter your email address');
    if (!/\S+@\S+\.\S+/.test(email)) return setError('Please enter a valid email');
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email: email.trim() });
      setStep(2);
    } catch (err) { setError(err.response?.data?.msg || 'Could not send code'); }
    finally { setLoading(false); }
  };

  const verifyCode = async (e) => {
    e.preventDefault(); clearErr();
    if (code.length !== 6) return setError('Code must be 6 digits');
    setLoading(true);
    try {
      await api.post('/auth/verify-reset-code', { email: email.trim(), code });
      setStep(3);
    } catch (err) { setError(err.response?.data?.msg || 'Invalid or expired code'); }
    finally { setLoading(false); }
  };

  const resetPassword = async (e) => {
    e.preventDefault(); clearErr();
    if (password.length < 6) return setError('Password must be at least 6 characters');
    if (password !== confirm) return setError('Passwords do not match');
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { email: email.trim(), code, newPassword: password });
      setSuccess(true);
    } catch (err) { setError(err.response?.data?.msg || 'Could not reset password'); }
    finally { setLoading(false); }
  };

  const resend = async () => {
    clearErr(); setLoading(true);
    try { await api.post('/auth/forgot-password', { email: email.trim() }); setCode(''); }
    catch (err) { setError(err.response?.data?.msg || 'Could not resend'); }
    finally { setLoading(false); }
  };

  // Success screen (no footer — parent renders it)
  if (success) {
    return (
      <main className="auth-screen">
        <section className="auth-card">
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#d1fae5', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <CheckCircle2 size={40} color="#059669" />
            </div>
            <h2 style={{ color: '#1a2c60', margin: '0 0 8px', fontSize: 'clamp(20px, 4vw, 24px)' }}>Password reset! 🎉</h2>
            <p style={{ color: '#666', marginBottom: 24, fontSize: 'clamp(13px, 3.5vw, 15px)' }}>
              Your password has been changed. You can now sign in.
            </p>
            <button className="btn-gold" style={{ width: '100%' }} onClick={onDone}>Back to Sign In</button>
          </div>
        </section>
      </main>
    );
  }

  const iconStyle = {
    width: 56, height: 56, borderRadius: '50%', background: '#1a2c601a',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  };

  return (
    <main className="auth-screen">
      <section className="auth-card">
        <button
          onClick={step === 1 ? onBack : () => setStep(step - 1)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1a2c60', display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, padding: 0, marginBottom: 12, fontWeight: 500 }}
        >
          <ArrowLeft size={16} /> {step === 1 ? 'Back to sign in' : 'Back'}
        </button>

        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={iconStyle}>
            {step === 1 && <Mail size={28} color="#1a2c60" />}
            {step === 2 && <KeyRound size={28} color="#1a2c60" />}
            {step === 3 && <Lock size={28} color="#1a2c60" />}
          </div>
          <p className="auth-title" style={{ marginBottom: 4, fontSize: 'clamp(18px, 4.5vw, 22px)' }}>
            {step === 1 && 'Forgot your password?'}
            {step === 2 && 'Check your email'}
            {step === 3 && 'Create new password'}
          </p>
          <p className="auth-sub2" style={{ fontSize: 'clamp(12px, 3.2vw, 14px)' }}>
            {step === 1 && "Enter your email and we'll send you a reset code."}
            {step === 2 && (<>We sent a 6-digit code to<br /><b style={{ color: '#1a2c60' }}>{email}</b></>)}
            {step === 3 && "Choose a strong password you haven't used before."}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
          {[1, 2, 3].map((n) => (
            <div key={n} style={{ flex: 1, height: 4, borderRadius: 2, background: n <= step ? '#e9a63a' : '#eee5d2', transition: 'background 0.3s' }} />
          ))}
        </div>

        {error && (
          <div style={{ background: '#fee2e2', color: '#991b1b', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 14, border: '1px solid #fecaca' }}>
            {error}
          </div>
        )}

        {step === 1 && (
          <form onSubmit={sendCode} className="auth-form">
            <label className="label">Email address</label>
            <input className="input" type="email" autoComplete="email" value={email}
              onChange={(e) => { setEmail(e.target.value); clearErr(); }}
              placeholder="you@example.com" autoFocus />
            <button className="btn-gold" type="submit" disabled={loading} style={{ width: '100%' }}>
              {loading ? <><Loader2 size={16} className="spin" /> Sending…</> : 'Send reset code'}
            </button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={verifyCode} className="auth-form">
            <label className="label">Enter 6-digit code</label>
            <input className="input" type="text" inputMode="numeric" maxLength={6} value={code}
              onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); clearErr(); }}
              placeholder="123456" autoFocus
              style={{ textAlign: 'center', letterSpacing: 8, fontSize: 'clamp(18px, 5vw, 22px)', fontWeight: 600 }} />
            <button className="btn-gold" type="submit" disabled={loading || code.length !== 6} style={{ width: '100%' }}>
              {loading ? <><Loader2 size={16} className="spin" /> Verifying…</> : 'Verify code'}
            </button>
            <p style={{ textAlign: 'center', fontSize: 13, color: '#666', marginTop: 10 }}>
              Didn't get it?{' '}
              <button type="button" onClick={resend} disabled={loading}
                style={{ background: 'none', border: 'none', color: '#d18f26', cursor: 'pointer', fontWeight: 600, padding: 0, textDecoration: 'underline' }}>
                Resend code
              </button>
            </p>
          </form>
        )}

        {step === 3 && (
          <form onSubmit={resetPassword} className="auth-form">
            <label className="label">New password</label>
            <input className="input" type="password" autoComplete="new-password" value={password}
              onChange={(e) => { setPassword(e.target.value); clearErr(); }}
              placeholder="At least 6 characters" autoFocus />
            <label className="label">Confirm new password</label>
            <input className="input" type="password" autoComplete="new-password" value={confirm}
              onChange={(e) => { setConfirm(e.target.value); clearErr(); }}
              placeholder="Type it again" />
            <button className="btn-gold" type="submit" disabled={loading} style={{ width: '100%' }}>
              {loading ? <><Loader2 size={16} className="spin" /> Resetting…</> : 'Reset password'}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}