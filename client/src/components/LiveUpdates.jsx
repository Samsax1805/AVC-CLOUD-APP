import React, { useEffect, useRef, useState } from 'react';
import api from '../services/api';
import { participates } from '../hooks/usePermissions';
import Icon from './ui/Icon';

// Keeps an open Choir Cloud up to date without anyone pressing refresh:
//  - the election stage (so the menu badge and dashboard banner change when voting goes live), every 30 s
//  - a new version of the website after a deploy: a banner offers to refresh, or the page refreshes itself
//    the next time it comes back into view
const STAGE_NEWS = {
  nominations: 'Nominations are open — make yours on the Elections page.',
  live: 'Voting is LIVE — cast your vote on the Elections page!',
  published: 'The election results are published.',
};
const bundleOf = (html) => (html.match(/\/assets\/index-[\w-]+\.js/) || [])[0] || null;

export default function LiveUpdates({ me, electionStatus, setElectionStatus, toast }) {
  const [update, setUpdate] = useState(false);
  const lastStage = useRef(electionStatus?.stage || null);
  const mine = useRef(null);

  // Election stage
  useEffect(() => { lastStage.current = electionStatus?.stage || null; }, [electionStatus?.stage]);
  useEffect(() => {
    const check = () => {
      if (document.hidden) return;
      api.get('/elections/status').then(({ data }) => {
        const s = data?.status || null;
        const before = lastStage.current;
        if ((s?.stage || null) === before && s?.label === electionStatus?.label) return;
        lastStage.current = s?.stage || null;
        setElectionStatus?.(s);
        if (s && s.stage !== before && STAGE_NEWS[s.stage] && participates(me)) toast(`${s.mock ? 'Practice election — ' : ''}${STAGE_NEWS[s.stage]}`);
      }).catch(() => {});
    };
    const t = setInterval(check, 30000);
    document.addEventListener('visibilitychange', check);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', check); };
  }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // New website version
  useEffect(() => {
    mine.current = document.querySelector('script[src*="/assets/index-"]')?.getAttribute('src') || null;
    if (!mine.current) return undefined; // the local test site has no build to compare
    let waiting = false;
    const check = () => {
      if (waiting && !document.hidden) { window.location.reload(); return; }
      fetch('/', { cache: 'no-store' }).then((r) => r.text()).then((html) => {
        const latest = bundleOf(html);
        if (latest && latest !== mine.current) {
          if (document.hidden) waiting = true; // refresh quietly when they come back
          else setUpdate(true);
        }
      }).catch(() => {});
    };
    check();
    const t = setInterval(check, 4 * 60 * 1000);
    document.addEventListener('visibilitychange', check);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', check); };
  }, []);

  if (!update) return null;
  return (
    <div className="update-bar" role="status">
      <Icon name="cloud" size={15} />
      <span>A new version of Choir Cloud is ready.</span>
      <button className="btn btn-sm btn-pri" onClick={() => window.location.reload()}>Refresh now</button>
      <button className="icon-x" aria-label="Later" onClick={() => setUpdate(false)}><Icon name="x" size={13} /></button>
    </div>
  );
}
