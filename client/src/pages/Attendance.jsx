import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { TODAY, uid, fmtDate, shortDate } from '../utils/helpers';
import { PERMS } from '../hooks/usePermissions';
import Icon from '../components/ui/Icon';
import Avatar from '../components/ui/Avatar';
import StatCard from '../components/ui/StatCard';
import Modal from '../components/ui/Modal';

const STYLES = { present: { c: '#059669', bg: '#d1fae5' }, absent: { c: '#dc2626', bg: '#fee2e2' }, late: { c: '#e0862c', bg: '#fdf3df' }, excused: { c: '#d97706', bg: '#fef3c7' }, unmarked: { c: '#64748b', bg: '#f1f5f9' } };

export default function Attendance({ ctx }) {
  const { me, users, sessions, setSessions, log, toast } = ctx;
  const canMark = PERMS.markAttendance(me);
  const [attDate, setAttDate] = useState(TODAY);
  const [attTitle, setAttTitle] = useState('Sunday Worship Service');
  const [records, setRecords] = useState({});
  const [qr, setQr] = useState(null);
  const [code, setCode] = useState('');
  const [detail, setDetail] = useState(null);

  useEffect(() => { const ex = sessions.find((s) => s.date === attDate); setRecords(ex ? { ...ex.records } : {}); if (ex) setAttTitle(ex.title); }, [attDate]); // eslint-disable-line

  const genQR = async () => {
    const exp = Date.now() + 90000;
    const token = btoa(JSON.stringify({ sid: attDate, exp }));
    const img = await QRCode.toDataURL(token, { width: 170, margin: 1 });
    setQr({ token, img, exp });
    log('ATTENDANCE', `Generated check-in QR for ${attTitle} (${fmtDate(attDate)})`);
    toast('QR generated — valid for 90 seconds');
  };

  const checkin = () => {
    try {
      const { sid, exp } = JSON.parse(atob(code.trim()));
      if (exp < Date.now()) return toast('Code expired — ask the Provost for a fresh QR', 'err');
      const exists = sessions.find((x) => x.date === sid);
      if (exists && (exists.records || {})[me.id]) return toast('You are already marked for this session', 'err');
      setSessions((p) => {
        const has = p.find((x) => x.date === sid);
        if (has) return p.map((x) => (x.date === sid ? { ...x, records: { ...x.records, [me.id]: 'present' }, checkins: [...(x.checkins || []), { userId: me.id, time: new Date().toLocaleTimeString(), method: 'qr' }] } : x));
        return [{ id: uid('att'), date: sid, title: 'Sunday Worship Service', records: { [me.id]: 'present' }, checkins: [{ userId: me.id, time: new Date().toLocaleTimeString(), method: 'qr' }] }, ...p];
      });
      log('ATTENDANCE', `${me.name} checked in via QR (${fmtDate(sid)})`);
      toast('Checked in ✅'); setCode('');
    } catch { toast('Invalid check-in code', 'err'); }
  };

  const counts = { present: 0, absent: 0, late: 0, excused: 0 };
  Object.values(records).forEach((v) => { if (counts[v] !== undefined) counts[v]++; });
  const unmarked = users.length - Object.keys(records).length;
  const save = () => {
    setSessions((prev) => {
      const existing = prev.find((s) => s.date === attDate);
      return [...prev.filter((s) => s.date !== attDate), { id: existing?.id || uid('att'), date: attDate, title: attTitle, records, checkins: existing?.checkins || [] }].sort((a, b) => (a.date < b.date ? 1 : -1));
    });
    log('ATTENDANCE', `Marked attendance for ${attTitle} (${fmtDate(attDate)})`); toast('Attendance saved');
  };

  const mine = sessions.map((s) => ({ date: s.date, st: s.records[me.id] || 'unmarked' }));
  const myMarked = mine.filter((m) => m.st !== 'unmarked');
  const myRate = myMarked.length ? Math.round((myMarked.filter((m) => m.st === 'present').length / myMarked.length) * 100) : 0;

  return (
    <div className="stack">
      <div className="page-head">
        <div><h2>Attendance</h2><p className="muted small">{canMark ? 'Tick members, generate the check-in QR, and click any date below for full details.' : 'Check in with the rehearsal QR code and track your record.'}</p></div>
      </div>
      <div className="grid g3">
        <StatCard icon="check" label="My attendance rate" value={myRate + '%'} tone="#059669" />
        <StatCard icon="calendar" label="My sessions recorded" value={myMarked.length} tone="#1a2c60" />
        <div className="card">
          <div className="card-h"><h3>Check in with code</h3></div>
          <div className="grant-cell">
            <input className="input" placeholder="Paste / scan check-in code" value={code} onChange={(e) => setCode(e.target.value)} />
            <button className="btn btn-pri btn-sm" onClick={checkin}>Check in</button>
          </div>
          <p className="muted tiny" style={{ marginTop: 8 }}>Codes expire in 90s and can't be used twice.</p>
        </div>
      </div>
      {canMark && (
        <>
          <div className="card" style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ width: 170, height: 170, background: '#fff', border: '1px dashed #e3d8c2', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {qr ? <img src={qr.img} alt="check-in QR" style={{ width: 160, height: 160 }} /> : <span className="muted tiny">No QR yet</span>}
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <h3 style={{ marginBottom: 6 }}>Live check-in QR — {fmtDate(attDate)}</h3>
              <p className="muted small" style={{ marginBottom: 12 }}>{qr ? 'Members scan or paste the code to check in.' : 'Generate a short-lived QR for this session.'}</p>
              <button className="btn btn-pri" onClick={genQR}><Icon name="check" size={15} /> {qr ? 'Refresh QR' : 'Generate QR'}</button>
            </div>
          </div>
          <div className="card">
            <div className="grid g3">
              <div className="field"><label className="label">Session date</label><input className="input" type="date" value={attDate} onChange={(e) => setAttDate(e.target.value)} /></div>
              <div className="field"><label className="label">Session title</label><input className="input" value={attTitle} onChange={(e) => setAttTitle(e.target.value)} /></div>
              <div className="att-summary">
                <span className="att-pill" style={{ background: '#d1fae5', color: '#059669' }}>{counts.present} present</span>
                <span className="att-pill" style={{ background: '#fee2e2', color: '#dc2626' }}>{counts.absent} absent</span>
                <span className="att-pill" style={{ background: '#fdf3df', color: '#e0862c' }}>{counts.late} late</span>
                <span className="att-pill" style={{ background: '#fef3c7', color: '#d97706' }}>{counts.excused} excused</span>
                {unmarked > 0 && <span className="att-pill" style={{ background: '#f1f5f9', color: '#64748b' }}>{unmarked} unmarked</span>}
              </div>
            </div>
            <div className="roster">
              {users.map((u) => (
                <div className="roster-row" key={u.id}>
                  <Avatar user={u} size={32} />
                  <div style={{ flex: 1 }}><b>{u.name}</b><div className="muted tiny">{u.voice}</div></div>
                  {['present', 'absent', 'late', 'excused'].map((st) => (
                    <button key={st} className={`att-btn ${st} ${records[u.id] === st ? 'on' : ''}`} onClick={() => setRecords((r) => ({ ...r, [u.id]: st }))} title={st}>
                      {st === 'present' ? <Icon name="check" size={13} /> : st === 'absent' ? <Icon name="x" size={13} /> : <Icon name="clock" size={13} />}
                      <span>{st[0].toUpperCase()}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
            <div className="modal-foot"><button className="btn btn-pri" onClick={save}><Icon name="check" size={15} /> Save attendance sheet</button></div>
          </div>
        </>
      )}
      <div className="card pad0">
        <div className="card-h pad"><h3>Session history — click a date for details</h3></div>
        <table className="tbl">
          <thead><tr><th>Date</th><th>Session</th><th>Present</th><th>Absent</th><th>Late</th><th>Excused</th><th>Rate</th></tr></thead>
          <tbody>
            {sessions.map((s) => {
              const vals = Object.values(s.records);
              const p = vals.filter((v) => v === 'present').length;
              const a = vals.filter((v) => v === 'absent').length;
              const l = vals.filter((v) => v === 'late').length;
              const e = vals.filter((v) => v === 'excused').length;
              const rate = vals.length ? Math.round((p / vals.length) * 100) : 0;
              return (
                <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => setDetail(s)}>
                  <td><b style={{ color: '#1a2c60' }}>{fmtDate(s.date)}</b></td><td className="muted">{s.title}</td>
                  <td><span className="att-pill" style={{ background: '#d1fae5', color: '#059669' }}>{p}</span></td>
                  <td><span className="att-pill" style={{ background: '#fee2e2', color: '#dc2626' }}>{a}</span></td>
                  <td><span className="att-pill" style={{ background: '#fdf3df', color: '#e0862c' }}>{l}</span></td>
                  <td><span className="att-pill" style={{ background: '#fef3c7', color: '#d97706' }}>{e}</span></td>
                  <td><div className="mini-progress"><div style={{ width: rate + '%' }} /></div><b>{rate}%</b></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Modal open={!!detail} onClose={() => setDetail(null)} title={`Attendance details — ${detail ? fmtDate(detail.date) : ''}`} wide>
        {detail && (
          <div className="stack sm-gap">
            {users.map((u) => {
              const st = detail.records[u.id] || 'unmarked';
              const cin = (detail.checkins || []).find((c) => c.userId === u.id);
              return (
                <div className="roster-row" key={u.id} style={{ border: '1px solid #f0e9da', borderRadius: 10 }}>
                  <Avatar user={u} size={32} />
                  <div style={{ flex: 1 }}><b>{u.name}</b><div className="muted tiny">{cin ? `Checked in ${cin.time} via ${cin.method.toUpperCase()}` : 'Manual / not recorded'}</div></div>
                  <span className="att-pill" style={{ background: STYLES[st].bg, color: STYLES[st].c }}>{st}</span>
                </div>
              );
            })}
          </div>
        )}
      </Modal>
    </div>
  );
}