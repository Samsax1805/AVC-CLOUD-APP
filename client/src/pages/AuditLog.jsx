import React, { useEffect, useState } from 'react';
import { ACT_META } from '../hooks/usePermissions';
import Avatar from '../components/ui/Avatar';
import EmptyState from '../components/ui/EmptyState';
import Pagination from '../components/ui/Pagination';
import { fetchAudit } from '../services/audit';

// The log grows forever, so the server sends it 50 entries at a time (GET /api/audit), searched and filtered there
export default function AuditPage({ ctx }) {
  const { users = [] } = ctx;
  const [fAct, setFAct] = useState('all');
  const [fUser, setFUser] = useState('all');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [res, setRes] = useState({ entries: [], total: 0, pages: 1, pageSize: 50, actions: [] });
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);

  // Typing waits a moment before searching, so each key press is not a request
  useEffect(() => { const t = setTimeout(() => setQ(search.trim()), 300); return () => clearTimeout(t); }, [search]);
  useEffect(() => { setPage(1); }, [q, fAct, fUser]);
  useEffect(() => {
    const ctl = new AbortController();
    setLoading(true); setFailed(false);
    fetchAudit({ page, q, action: fAct, user: fUser }, ctl.signal)
      .then((data) => { setRes(data); if (data.page !== page) setPage(data.page); })
      .catch((e) => { if (e.name !== 'CanceledError') setFailed(true); })
      .finally(() => { if (!ctl.signal.aborted) setLoading(false); });
    return () => ctl.abort();
  }, [page, q, fAct, fUser, retry]);

  const rows = res.entries || [];
  const paged = { page: res.page || page, setPage, pages: res.pages || 1, total: res.total || 0, pageSize: res.pageSize || 50 };
  return (
    <div className="stack">
      <div className="page-head">
        <div><h2>Audit Log</h2><p className="muted small">Every action across the platform — roles, uploads, payments, votes.</p></div>
        <div className="head-actions">
          <input className="input sm" type="search" placeholder="Search the log…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search the audit log" />
          <select className="input sm" value={fAct} onChange={(e) => setFAct(e.target.value)}><option value="all">All actions</option>{(res.actions || []).map((a) => <option key={a} value={a}>{ACT_META[a]?.l || a}</option>)}</select>
          <select className="input sm" value={fUser} onChange={(e) => setFUser(e.target.value)}><option value="all">All users</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
        </div>
      </div>
      <div className="card pad0" style={{ opacity: loading ? 0.6 : 1 }}>
        <table className="tbl">
         <thead><tr><th>Time</th><th>User</th><th>Role at time</th><th>Action</th><th>Details</th></tr></thead>
          <tbody>
            {rows.map((a) => {
              const u = users.find((x) => x.id === a.userId);
              const meta = ACT_META[a.action] || { l: a.action, c: '#64748b' };
              return (
                <tr key={a.id}>
                  <td className="muted small">{a.time}</td>
                  <td><div className="cell-user"><Avatar user={u} size={28} /><b>{u?.name}</b></div></td>
                  <td><span className="act-tag" style={{ background: '#1a2c601a', color: '#1a2c60' }}>{a.role || '—'}</span></td>
                  <td><span className="act-tag" style={{ background: meta.c + '1a', color: meta.c }}>{meta.l}</span></td>
                  <td className="small">{a.detail}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <Pagination paged={paged} label="entries" />
        {failed && <EmptyState icon="shield" text={<>Could not load the Audit Log. <button className="chip link" onClick={() => setRetry((n) => n + 1)}>Try again</button></>} />}
        {!failed && !loading && !rows.length && <EmptyState icon="shield" text="No entries match these filters." />}
      </div>
    </div>
  );
}
