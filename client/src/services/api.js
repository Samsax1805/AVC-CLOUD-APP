import axios from 'axios';
const api = axios.create({ baseURL: '/api' });
api.interceptors.request.use((c) => {
  const t = localStorage.getItem('avc_token');
  if (t) c.headers['x-auth-token'] = t;
  return c;
});

// Refusals that mean this login is over (see server/middleware/auth.js)
const SESSION_ENDED = ['NO_TOKEN', 'INVALID_TOKEN', 'SESSION_EXPIRED', 'ACCOUNT_INACTIVE'];
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