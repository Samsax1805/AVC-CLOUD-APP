import React, { useEffect, useState } from 'react';
import Icon from './ui/Icon';
import * as push from '../services/push';

// A one-time invitation on the Dashboard to get notifications on this device
const KEY = 'avc_push_banner_hidden';
export default function PushBanner({ me, toast }) {
  const [state, setState] = useState(null);
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } });
  useEffect(() => { if (!hidden && !me?.system) push.status().then(setState).catch(() => {}); }, [hidden, me?.system]);
  const hide = () => { setHidden(true); try { localStorage.setItem(KEY, '1'); } catch { /* private window */ } };
  if (hidden || me?.system || !['off', 'install-first'].includes(state)) return null;
  const on = async () => {
    try { await push.turnOn(); toast('Notifications are on for this device'); hide(); } catch (e) { toast(e.response?.data?.msg || e.message, 'err'); }
  };
  return (
    <div className="card push-banner">
      <Icon name="bell" size={18} />
      <p><b>Get choir news on this {/mobi/i.test(navigator.userAgent) ? 'phone' : 'device'}.</b> {state === 'install-first' ? 'On iPhone, add the site to your Home Screen (Share → Add to Home Screen), then turn notifications on in Settings.' : 'Voting, Sunday songs, reports, psalmist duty and messages, as they happen.'}</p>
      {state === 'off' && <button className="btn btn-sm btn-pri" onClick={on}>Turn on</button>}
      <button className="btn btn-sm btn-ghost" onClick={hide}>Not now</button>
    </div>
  );
}
