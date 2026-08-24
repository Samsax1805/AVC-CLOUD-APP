import React, { useState, useEffect, useRef } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const GIS_SRC = 'https://accounts.google.com/gsi/client';

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="g-mark">
      <path fill="#4285F4" d="M21.35 12.23c0-.79-.07-1.55-.22-2.27H12v4.3h5.24a4.48 4.48 0 0 1-1.94 2.94v2.45h3.14c1.84-1.7 2.91-4.2 2.91-7.42Z" />
      <path fill="#34A853" d="M12 21.7c2.63 0 4.84-.87 6.45-2.36l-3.14-2.45c-.87.58-1.98.92-3.31.92-2.54 0-4.69-1.72-5.46-4.03H3.3v2.53A9.74 9.74 0 0 0 12 21.7Z" />
      <path fill="#FBBC05" d="M6.54 13.78A5.85 5.85 0 0 1 6.23 12c0-.62.11-1.22.31-1.78V7.69H3.3A9.73 9.73 0 0 0 2.27 12c0 1.57.38 3.05 1.03 4.31l3.24-2.53Z" />
      <path fill="#EA4335" d="M12 6.19c1.43 0 2.71.49 3.72 1.45l2.79-2.79C16.84 3.28 14.63 2.3 12 2.3a9.74 9.74 0 0 0-8.7 5.39l3.24 2.53c.77-2.31 2.92-4.03 5.46-4.03Z" />
    </svg>
  );
}

export default function Login({ onSwitch }) {
  const { login, startGoogleLogin } = useAuth();
  const { toast } = useToast();

  // [BACKEND] VITE_GOOGLE_CLIENT_ID is set in client/.env
  // The backend should verify the Google ID token using google-auth-library
  // and match the same Client ID that was issued in Google Cloud Console.
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
  const gBtnRef = useRef(null);
  const startRef = useRef(startGoogleLogin);
  useEffect(() => { startRef.current = startGoogleLogin; });

  // ====================================================================
  // [BACKEND] AUTHENTICATION FLOW - READ THIS CAREFULLY
  // ====================================================================
  //
  // 1. EMAIL/PASSWORD LOGIN
  //    POST /api/auth/login
  //    Body:      { "email": "string", "password": "string" }
  //    Success:   { "user": { id, name, email, roles:[], section, avatar }, "access": "JWT" }
  //    Failure:   401 { "msg": "Invalid credentials" }
  //
  // 2. GOOGLE SIGN-IN
  //    POST /api/auth/google
  //    Body:      { "email", "name", "avatarUrl", "googleId", "idToken" (optional raw token) }
  //    Behaviour: - If email exists -> log them in
  //               - If email is new -> auto-create user with role=["member"], section=null
  //    Success:   Same shape as /login
  //    Failure:   401 { "msg": "Google sign-in failed" }
  //
  // 3. SECTION SELECTION (shown after Google login or if section is null)
  //    POST /api/auth/section
  //    Body:      { "section": "Soprano" | "Alto" | "Tenor" | "Bass" }
  //    Header:    Authorization: Bearer <JWT>
  //    Success:   { "user": { ...updated user with section set } }
  //
  // 4. REGISTRATION
  //    POST /api/auth/register
  //    Body:      { "name", "phone", "email", "password" }
  //    Success:   { "success": true, "message": "Registration submitted for approval" }
  //    Note:      New users should be created with approved=false until Admin approves.
  //
  // 5. PASSWORD RESET (placeholder, not yet wired)
  //    POST /api/auth/forgot-password  { "email" }
  //    POST /api/auth/reset-password   { "token", "newPassword" }
  //
  // 6. SEED / DEMO ACCOUNTS (please create these on first deploy):
  //    admin@choircloud.com     / demo123   -> role: admin
  //    president@choircloud.com / demo123   -> role: president
  //    secretary@choircloud.com / demo123   -> role: secretary
  //    provost@choircloud.com   / demo123   -> role: provost
  //    custodian@choircloud.com / demo123   -> role: custodian
  //    electoral@choircloud.com / demo123   -> role: electoral
  //    miriam@choircloud.com    / demo123   -> role: member, section: Soprano
  //
  // 7. TOKEN HANDLING
  //    - Frontend stores JWT in localStorage under key "avc_token"
  //    - Frontend sends it as header: x-auth-token (interceptor in services/api.js)
  //    - Backend should accept either `x-auth-token` or `Authorization: Bearer`
  // ====================================================================

  useEffect(() => {
    if (!clientId) return;
    let on = true;
    const init = () => {
      if (!on || !window.google?.accounts?.id) return;
      const g = window.google.accounts.id;
      g.initialize({
        client_id: clientId, auto_select: false, ux_mode: 'popup',
        callback: (resp) => {
          try {
            const p = JSON.parse(atob(resp.credential.split('.')[1]));
            // Send decoded Google profile to backend via /api/auth/google
            startRef.current({ email: p.email, name: p.name, avatarUrl: p.picture, googleId: p.sub, idToken: resp.credential });
          } catch { /* ignore bad token */ }
        },
      });
      g.disableAutoSelect();
      if (gBtnRef.current) { gBtnRef.current.innerHTML = ''; g.renderButton(gBtnRef.current, { theme: 'outline', size: 'large', shape: 'rectangular', text: 'continue_with', width: 300 }); }
      setGoogleReady(true);
    };
    if (window.google?.accounts) init();
    else { const s = document.createElement('script'); s.src = GIS_SRC; s.async = true; s.onload = init; document.head.appendChild(s); }
    return () => { on = false; };
  }, [clientId]);

  const submit = async (e) => {
    e.preventDefault();
    if (!email || !pass) return toast('Email and password are required.', 'err');
    setLoading(true);
    try { await login(email, pass); }
    catch (err) { toast(err.message || 'Login failed. Please check your credentials.', 'err'); }
    finally { setLoading(false); }
  };

  // Sandbox fallback - used when VITE_GOOGLE_CLIENT_ID is not set (dev mode)
  const sandboxGoogle = () => startGoogleLogin({ email: 'google.chorister@gmail.com', name: 'Google Chorister', avatarUrl: null, googleId: 'sandbox-' + Date.now() });

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
            <button type="button" className="link-gold" onClick={() => toast('Password reset is coming soon.')}>Forgot Password?</button>
          </div>
          <div className="relative">
            <input id="login-password" name="password" className="input" type={show ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter your password" value={pass} onChange={(e) => setPass(e.target.value)} style={{ paddingRight: 38 }} />
            <button type="button" className="eye-btn" aria-label="Toggle password visibility" onClick={() => setShow((v) => !v)}>{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
          </div>
          <button className="btn-gold" type="submit" disabled={loading}>{loading && <Loader2 size={16} className="spin" />} Sign In</button>
        </form>
        <div className="or-row"><span className="or-line" />OR<span className="or-line" /></div>
        <div className="google-wrap">
          {clientId ? (
            googleReady ? <div ref={gBtnRef} /> : <button className="btn-google2" disabled><Loader2 size={16} className="spin" /> Loading Google…</button>
          ) : (
            <button className="btn-google2" type="button" onClick={sandboxGoogle}><GoogleMark /><span>Continue with Google</span></button>
          )}
        </div>
        <p className="auth-foot-link">Don&apos;t have an account? <button className="link-gold" onClick={onSwitch}>Create Account</button></p>
      </section>
      <footer className="auth-footer">© 2026 St. Barnabas Amazing Voices Choir. All rights Reserved</footer>
    </main>
  );
}
