import React, { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '../../components/ui/Icon';
import ItemEditor from './ItemEditor';
import { ACCEPT, createItem, listItems, loadLists, problem, settleDuplicate, uploadToLibrary, MAX_MB } from '../../services/library';

// The upload queue (design page 8): copies go in first, are saved at once with a Q number, and wait here
// until their details are complete. Only officers who manage music see it.
const FILTERS = [['all', 'All'], ['needs', 'Needs details'], ['ready', 'Ready to send'], ['sent', 'Sent back'], ['urgent', 'Urgent'], ['awaiting', 'Awaiting approval'], ['mine', 'Claimed by me'], ['existing', 'Existing songs'], ['duplicates', 'Duplicates']];
const STATUS = { needs: ['Needs details', 'lib-st-needs'], ready: ['Ready to send', 'lib-st-ready'], awaiting: ['Awaiting approval', 'lib-st-await'], sent: ['Sent back', 'lib-st-sent'], urgent: ['Urgent · not yet reviewed', 'lib-st-urgent'] };

export default function LibraryQueue({ ctx, perms = {} }) {
  const { toast, me } = ctx;
  const [lists, setLists] = useState(null);
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('oldest');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(null);
  const [uploads, setUploads] = useState([]);
  const [link, setLink] = useState('');
  const [drag, setDrag] = useState(false);
  const seq = useRef(0);

  useEffect(() => { loadLists().then(setLists).catch(() => toast('The lists could not be loaded: check your connection', 'err')); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const load = useCallback(() => {
    const n = ++seq.current;
    return listItems({ filter, q: q.trim() || undefined, sort, page }).then((d) => { if (n === seq.current) { setData(d); setFailed(false); } }).catch(() => n === seq.current && setFailed(true));
  }, [filter, q, sort, page]);
  useEffect(() => { const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t); }, [load, q]);
  // Keeps "editing now", claims and new uploads by others current while the queue is on screen
  useEffect(() => { if (open) return undefined; const t = setInterval(() => document.visibilityState === 'visible' && load(), 30000); return () => clearInterval(t); }, [open, load]);

  const upload = async (files) => {
    for (const file of files) {
      const key = `${file.name}-${file.size}-${Date.now()}`;
      const upd = (x) => setUploads((u) => u.map((y) => (y.key === key ? { ...y, ...x } : y)));
      setUploads((u) => [{ key, name: file.name, sent: 0, total: file.size, phase: 'uploading' }, ...u]);
      try {
        const up = await uploadToLibrary(file, { onState: (s) => upd({ ...(s.sent !== undefined ? { sent: s.sent } : {}), phase: s.phase }) });
        upd({ phase: 'saving' });
        const item = await createItem({ upload: up }, { onWait: (p) => upd({ phase: p }) });
        upd({ phase: 'saved', ref: item.ref, uid: item.uid, dup: item.dup?.ref });
        load();
      } catch (e) { upd({ phase: 'failed', msg: problem(e) }); }
    }
  };
  const addLink = () => createItem({ link: { url: link.trim() } }).then((it) => { setLink(''); toast(`Saved as ${it.ref}`); load(); }).catch((e) => toast(problem(e), 'err'));

  if (open) return <ItemEditor uid={open} lists={lists} me={me} perms={perms} toast={toast} onChanged={load} onClose={() => { setOpen(null); load(); }} />;
  const c = data?.counts || {};

  return (
    <div className="lib-queue">
      <div className="lib-q-grid">
        <div className="card lib-quick">
          <div className="lib-side-h">Quick upload</div>
          <label className={`lib-drop ${drag ? 'over' : ''}`} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); upload([...e.dataTransfer.files]); }}>
            <Icon name="upload" size={22} />
            <b className="small">Drop score copies here, or tap to choose</b>
            <span className="muted tiny">PDF, picture, MusicXML or MuseScore · audio, MIDI or video · several at once · up to {MAX_MB} MB each</span>
            <input type="file" hidden multiple accept={ACCEPT} onChange={(e) => { upload([...e.target.files]); e.target.value = ''; }} />
          </label>
          {uploads.length > 0 && (
            <div className="lib-ups">
              {uploads.map((u) => (
                <div key={u.key} className="lib-up">
                  <span className="lib-up-name" title={u.name}>{u.name}</span>
                  {u.phase === 'saved' ? <button type="button" className="lib-saved ok as-link" onClick={() => setOpen(u.uid)}>✓ Saved · {u.ref}{u.dup ? ` (same file as ${u.dup})` : ''}</button>
                    : u.phase === 'failed' ? <span className="lib-err">{u.msg}</span>
                      : u.phase === 'offline' ? <span className="lib-saved warn">Paused · will resume</span>
                        : u.phase === 'retrying' ? <span className="muted tiny">Trying again…</span>
                          : u.phase === 'saving' ? <span className="muted tiny">Saving…</span>
                            : <span className="tiny"><span className="lib-bar"><i style={{ width: `${(100 * u.sent) / u.total}%` }} /></span> {Math.round((100 * u.sent) / u.total)}%</span>}
                </div>
              ))}
              {uploads.some((u) => u.phase === 'saved' || u.phase === 'failed') && <button type="button" className="btn btn-sm btn-ghost" onClick={() => setUploads((u) => u.filter((x) => !['saved', 'failed'].includes(x.phase)))}>Clear finished</button>}
            </div>
          )}
          <div className="field" style={{ marginTop: 10 }}>
            <label className="label" style={{ marginTop: 0 }}>Only a recording? Paste its link</label>
            <div className="chip-row" style={{ flexWrap: 'nowrap' }}>
              <input className="input sm" placeholder="https://…" value={link} onChange={(e) => setLink(e.target.value)} />
              <button type="button" className="btn btn-sm btn-soft" disabled={!link.trim()} onClick={addLink}>Add</button>
            </div>
          </div>
          <p className="muted tiny" style={{ marginTop: 8 }}>Each file becomes its own queue item and is saved the moment it arrives. Add part scores and recordings to an item from its page.</p>
        </div>

        <div className="card lib-list">
          <div className="lib-list-h">
            <div className="lib-side-h">Upload queue <span className="muted small">· {c.all ?? '…'} waiting</span></div>
            <select className="input sm" aria-label="Sort" value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }} style={{ width: 'auto' }}>
              <option value="oldest">Oldest first</option><option value="newest">Newest first</option><option value="progress">Most complete</option><option value="recent">Recently changed</option>
            </select>
          </div>
          <div className="chip-row wrap" style={{ margin: '8px 0' }}>
            {FILTERS.map(([k, l]) => (k === 'all' || c[k] || filter === k) && <button type="button" key={k} className={`chip sm ${filter === k ? 'on' : ''}`} onClick={() => { setFilter(k); setPage(1); }}>{l} {c[k] ?? ''}</button>)}
          </div>
          <div className="search-box" style={{ marginBottom: 8 }}><Icon name="search" size={14} /><input aria-label="Search the queue" placeholder="Search Q number, title, composer, file name…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
          {failed && !data && <p className="muted small">The queue could not be loaded. Check your connection.</p>}
          {data && !data.items.length && <p className="muted small" style={{ padding: '18px 0' }}>{q || filter !== 'all' ? 'Nothing matches.' : 'The queue is empty. Upload score copies to start.'}</p>}
          <div className="lib-rows">
            {data?.items.map((it) => (
              <div key={it.uid} className="lib-row">
                <button type="button" className="lib-row-main" onClick={() => setOpen(it.uid)}>
                  <span className="lib-q">{it.ref}</span>
                  <span className="lib-row-t"><b>{it.title || 'Untitled'}</b><span className="muted tiny">{it.existing ? 'Existing song · ' : ''}{it.files} file{it.files === 1 ? '' : 's'}{it.recording ? ' · recording' : ' · no recording yet'}</span></span>
                  <span className="lib-row-s"><span className={`lib-pill ${STATUS[it.status]?.[1] || ''}`}>{STATUS[it.status]?.[0] || it.status}</span><span className="lib-bar"><i style={{ width: `${(100 * it.done) / it.total}%` }} /></span><span className="tiny">{it.done}/{it.total}</span></span>
                  <span className="lib-row-w tiny">{it.editing.length ? <><b>{it.editing.map((n) => n.split(' ')[0]).join(', ')}</b><br /><span className="muted">editing now</span></> : it.claim?.active ? <>{it.claim.mine ? 'You' : it.claim.name.split(' ')[0]}<br /><span className="muted">claimed</span></> : <span className="muted">Unclaimed</span>}</span>
                </button>
                {it.dup && (
                  <div className="lib-dup tiny">Same file as {it.dup}?
                    <button type="button" className="as-link" onClick={() => settleDuplicate(it.uid, 'merge').then(() => { toast(`Merged into ${it.dup}`); load(); }).catch((e) => toast(problem(e), 'err'))}>Merge</button> ·
                    <button type="button" className="as-link" onClick={() => settleDuplicate(it.uid, 'keep').then(load).catch((e) => toast(problem(e), 'err'))}>Keep</button>
                  </div>
                )}
              </div>
            ))}
          </div>
          {data?.pages > 1 && (
            <div className="chip-row" style={{ justifyContent: 'center', marginTop: 10 }}>
              <button type="button" className="btn btn-sm btn-soft" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
              <span className="small muted">Page {data.page} of {data.pages}</span>
              <button type="button" className="btn btn-sm btn-soft" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
