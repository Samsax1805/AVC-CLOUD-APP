import axios from 'axios';
const api = axios.create({ baseURL: '/api' });
// Which version of the website this is (the built file's name), so officers can see who is on an old copy
const BUILD = (typeof document !== 'undefined' && (document.querySelector('script[src*="/assets/index-"]')?.getAttribute('src') || '').match(/index-([\w-]+)\.js/)?.[1]) || 'dev';
api.interceptors.request.use((c) => {
  const t = localStorage.getItem('avc_token');
  if (t) c.headers['x-auth-token'] = t;
  c.headers['x-app-build'] = BUILD;
  return c;
});

// Refusals that mean this login is over (see server/middleware/auth.js)
const SESSION_ENDED = ['NO_TOKEN', 'INVALID_TOKEN', 'SESSION_EXPIRED', 'ACCOUNT_INACTIVE', 'SESSION_REVOKED'];
let sessionEndedHandler = null;
export const onSessionEnded = (fn) => {
  sessionEndedHandler = fn;
  return () => { sessionEndedHandler = null; };
};

// A reply to a request sent with an older login can arrive after a new one: it must not affect it
const sameLogin = (config) => (config?.headers?.['x-auth-token'] || null) === localStorage.getItem('avc_token');

api.interceptors.response.use(
  (res) => {
    const renewed = res.headers['x-renewed-token'];
    if (renewed && sameLogin(res.config)) localStorage.setItem('avc_token', renewed);
    return res;
  },
  (err) => {
    const { status, data } = err.response || {};
    if (status === 401 && SESSION_ENDED.includes(data?.code) && sameLogin(err.config)) sessionEndedHandler?.(data.code);
    return Promise.reject(err);
  },
);

export default api;