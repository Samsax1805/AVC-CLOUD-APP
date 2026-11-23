import React, { useEffect, useState } from 'react';
import Icon from './ui/Icon';
import * as push from '../services/push';

// Settings → Notifications: turn phone/computer notifications on or off for this device
export default function PushSettings({ toast }) {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const refresh = () => push.status().then(setState).catch(() => setState('unsupported'));
  useEffect(() => { refresh(); }, []);
  const run = async (fn, done) => {
    setBusy(true);
    try { await fn(); if (done) toast(done); } catch (e) { toast(e.response?.data?.msg || e.message || 'That did not work', 'err'); } finally { setBusy(false); refresh(); }
  };
  return (
    <div className="card push-card">
      <div className="card-h"><h3><Icon name="bell" size={16} /> Notifications on this device</h3>{state === 'on' && <span className="chip sm ok">On</span>}</div>
      <p className="muted small">Get a notification on this phone or computer when voting goes live, the Sunday songs are ready, a financial report is published, you're the psalmist, there's a birthday, or someone messages you.</p>
      {state === null && <p className="muted small">Checking…</p>}
      {state === 'off' && <button className="btn btn-pri" disabled={busy} onClick={() => run(push.turnOn, 'Notifications are on for this device')}><Icon name="bell" size={14} /> Turn on notifications</button>}
      {state === 'on' && (
        <div className="push-row">
          <button className="btn btn-soft" disabled={busy} onClick={() => run(async () => { const { data } = await push.sendTest(); if (!data.sent) throw new Error('The test could not be delivered. Try turning notifications off and on again.'); }, 'Test sent: it should appear in a moment')}>Send a test</button>
          <button className="btn btn-ghost" disabled={busy} onClick={() => run(push.turnOff, 'Notifications are off for this device')}>Turn off</button>
        </div>
      )}
      {state === 'blocked' && <p className="small warn-text">Notifications are blocked for avcsb.com. Allow them in your browser's site settings, then come back here.</p>}
      {state === 'install-first' && (
        <div className="push-ios">
          <b>On iPhone and iPad, add the site to your Home Screen first:</b>
          <ol><li>Open avcsb.com in <b>Safari</b>.</li><li>Tap the <b>Share</b> button, then <b>Add to Home Screen</b>.</li><li>Open the choir app from your Home Screen, sign in, and come back to Settings → Notifications.</li></ol>
        </div>
      )}
      {state === 'unsupported' && <p className="muted small">This browser can't show notifications. Try Chrome, Edge, Firefox or Safari.</p>}
      <p className="muted tiny">Each device is separate: turn it on on every phone or computer where you want notifications.</p>
    </div>
  );
}
