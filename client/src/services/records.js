import api from './api';

// Saving one record at a time (not the whole choir's data): each call returns the record as the server saved it
export const addRecord = (kind, body) => api.post(`/records/${kind}`, body).then((r) => r.data.record);
export const changeRecord = (kind, id, patch) => api.put(`/records/${kind}/${id}`, patch).then((r) => r.data.record);
export const removeRecord = (kind, id) => api.delete(`/records/${kind}/${id}`);
export const saveError = (e) => e?.response?.data?.msg || e?.message || 'That was not saved. Check your connection and try again.';
