import api from './api';

// The Audit Log, a page at a time, newest first (GET /api/audit; Admin and President only)
export const fetchAudit = ({ page = 1, q = '', action = 'all', user = 'all', limit } = {}, signal) => api
  .get('/audit', { params: { page, q: q || undefined, action: action === 'all' ? undefined : action, user: user === 'all' ? undefined : user, limit }, signal })
  .then(({ data }) => data);
