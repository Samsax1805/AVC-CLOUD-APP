import api from './api';
export const loadState = async () => { try { const { data } = await api.get('/state'); return data || null; } catch { return null; } };
export const saveState = async (state) => { try { await api.put('/state', state); } catch (e) { /* server offline — keep working locally */ } };