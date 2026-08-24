import axios from 'axios';
const api = axios.create({ baseURL: '/api' });
api.interceptors.request.use((c) => {
  const t = localStorage.getItem('avc_token');
  if (t) c.headers['x-auth-token'] = t;
  return c;
});
export default api;