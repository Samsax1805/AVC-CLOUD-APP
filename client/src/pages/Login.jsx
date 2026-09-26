import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { initGoogleAuth, renderGoogleButton } from '../services/googleAuth';
// [FIX] ForgotPassword import REMOVED — App.jsx now handles that screen (no duplicate footer)

const GoogleMark = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="g-mark">
    <path fill="#4285F4" d="M21.35 12.23c0-.79-.07-1.55-.22-2.27H12v4.3h5.24a4.48 4.48 0 0 1-1.94 2.94v2.45h3.14c1.84-1.7 2.91-4.2 2.91-7.42Z" />
    <path fill="#34A853" d="M12 21.7c2.63 0 4.84-.87 6.45-2.36l-3.14-2.45c-.87.58-1.98.92-3.31.92-2.54 0-4.69-1.72-5.46-4.03H3.3v2.53A9.74 9.74 0 0 0 12 21.7Z" />
    <path fill="#FBBC05" d="M6.54 13.78A5.85 5.85 0 0 1 6.23 12c0-.62.11-1.22.31-1.78V7.69H3.3A9.73 9.73 0 0 0 2.27 12c0 1.57.38 3.05 1.03 4.31l3.24-2.53Z" />
    <path fill="#EA4335" d="M12 6.19c1.43 0 2.71.49 3.72 1.45l2.79-2.79C16.84 3.28 14.63 2.3 12 2.3a9.74 9.74 0 0 0-8.7 5.39l3.24 2.53c.77-2.31 2.92-4.03 5.46-4.03Z" />
  </svg>
);

export default function Login({ onSwitch, onForgot }) {
  const { login, googleLogin, sandboxLogin } = useAuth();
  const { toast } = useToast();
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(null);
  const [googleReady, setGoogleReady] = useState(false);
  const btnRef = useRef(null);
  // [FIX] showForgot state REMOVED — navigation is handled by App.jsx

  const googleLoginRef = useRef(googleLogin);
  useEffect(() => { googleLoginRef.current = googleLogin; }, [googleLogin]);
  const toastRef = useRef(toast);
  useEffect(() => { toastRef.current = toast; }, [toast]);

  // Initialize GIS exactly once (singleton) — no more "called multiple times" warning
  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    initGoogleAuth(clientId, (resp) => {
      googleLoginRef.current(resp.credential)
        .then(() => toastRef.current('Signed in with Google'))
        .catch((err) => toastRef.current(err.message || 'Google sign-in failed', 'err'));
    })
      .then(() => { if (!cancelled) setGoogleReady(true); })
      .catch(() => { if (!cancelled) setGoogleReady(false); });
    return () => { cancelled = true; };
  }, [clientId]);

  // Paint the official button as soon as its host div exists
  const attachButton = useCallback((node) => {
    btnRef.current = node;
    if (node && googleReady) renderGoogleButton(node);
  }, [googleReady]);

  useEffect(() => {
    if (googleReady && btnRef.current) renderGoogleButton(btnRef.current);
  }, [googleReady]);

  const submit = async (e) => {
    e.preventDefault();
    if (!email || !pass) return toast('Email and password are required.', 'err');
    setLoading('form');
    try { await login(email, pass); }
    catch (err) { toast(err.message || 'Login failed. Please check your credentials.', 'err'); }
    finally { setLoading(null); }
  };

  return (
    <main className="auth-screen">
      <section className="auth-card">
        <img src="/choir_logo.jpeg" alt="AVC Logo" className="auth-logo" />
        <p className="auth-title">St. Barnabas<br />Amazing Voices Choir</p>
        <p className="auth-sub2">Sing Praises to the Lord</p>
        <form onSubmit={submit} className="auth-form">
          <label className="label" htmlFor="login-email">Email address</label>
          <input id="login-email" name="email" className="input" type="email" autoComplete="email" placeholder="Enter your email address" value={email} onChange={(e) => setEmail(e.target.value)} />
          <div className="lab-row">
            <label className="label" htmlFor="login-password">Password</label>
            {/* [FIX] Delegates to App.jsx — ForgotPassword now REPLACES this screen (single footer) */}
            <button type="button" className="link-gold" onClick={() => onForgot && onForgot()}>Forgot Password?</button>
          </div>
          <div className="relative">
            <input id="login-password" name="password" className="input" type={show ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter your password" value={pass} onChange={(e) => setPass(e.target.value)} style={{ paddingRight: 38 }} />
            <button type="button" className="eye-btn" aria-label="Toggle password visibility" onClick={() => setShow((v) => !v)}>{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
          </div>
          <button className="btn-gold" type="submit" disabled={loading !== null}>{loading === 'form' && <Loader2 size={16} className="spin" />} Sign In</button>
        </form>
        <div className="or-row"><span className="or-line" />OR<span className="or-line" /></div>
        <div className="google-wrap">
          {clientId ? (
            googleReady
              ? <div ref={attachButton} style={{ display: 'flex', justifyContent: 'center' }} />
              : <button className="btn-google2" disabled><Loader2 size={16} className="spin" /> Loading Google…</button>
          ) : (
            <button className="btn-google2" type="button" onClick={() => sandboxLogin()}><GoogleMark /><span>Continue with Google</span></button>
          )}
        </div>
        <p className="auth-foot-link">Don&apos;t have an account? <button className="link-gold" onClick={onSwitch}>Create Account</button></p>
      </section>
      <footer className="auth-footer">© 2026 St. Barnabas Amazing Voices Choir. All rights Reserved</footer>
    </main>
  );
}