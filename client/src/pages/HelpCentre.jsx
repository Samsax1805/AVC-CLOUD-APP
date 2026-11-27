import React, { useMemo, useState } from 'react';
import Icon from '../components/ui/Icon';
import { PERMS, ROLES, isAlumni, visibleNav } from '../hooks/usePermissions';
import { HELP_ARTICLES, HELP_FAQ, HELP_GROUPS, HELP_SAFETY } from '../data/helpArticles';

// Help Centre: short guides for the site as it works now. Guides for the person's own offices come first;
// every guide can be read by anyone, but the "Open …" button shows only for pages they can use.
const ALWAYS = new Set(['profile', 'dashboard']);
const words = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9₺]+/).filter(Boolean);

export default function HelpCentre({ ctx }) {
  const { me, openHelp, setPage } = ctx;
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  const myRoles = me?.roles || [];
  const pages = useMemo(() => new Set([...ALWAYS, ...visibleNav(me).map((n) => n.id), ...(PERMS.viewSecurity(me) ? ['security'] : [])]), [me]);
  const mine = (a) => Array.isArray(a.who) && !isAlumni(me) && a.who.some((r) => myRoles.includes(r));
  const forYou = HELP_ARTICLES.filter(mine).sort((a, b) => a.who.length - b.who.length);

  const found = useMemo(() => {
    const t = words(q);
    if (!t.length) return null;
    const hay = (a) => words([a.title, a.summary, a.tags, ...a.steps, ...(a.tips || [])].join(' ')).join(' ');
    const faq = HELP_FAQ.filter(([qq, aa]) => t.every((w) => words(`${qq} ${aa}`).join(' ').includes(w)));
    return { guides: HELP_ARTICLES.filter((a) => t.every((w) => hay(a).includes(w))), faq };
  }, [q]);

  // a button only when this person can use that page (and, for music, that tab)
  const canGo = (a) => pages.has(a.go.page) && (a.go.musicTab !== 'queue' || PERMS.libraryQueue(me)) && (a.go.musicTab !== 'approvals' || mine(a));
  const go = (g) => (openHelp ? openHelp(g) : setPage(g.page));
  const forWho = (a) => (a.who === 'everyone' ? 'Everyone' : a.who.map((r) => ROLES[r]?.label || r).join(' · '));
  const Guide = ({ a }) => {
    const isOpen = open === a.id;
    return (
      <div className={`help-guide ${isOpen ? 'open' : ''}`}>
        <button type="button" className="help-guide-h" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : a.id)}>
          <span className="help-guide-t"><b>{a.title}</b><span className="muted tiny">{a.summary}</span></span>
          <span className="help-chev" aria-hidden>{isOpen ? '−' : '+'}</span>
        </button>
        {isOpen && (
          <div className="help-guide-b">
            <div className="muted tiny">For: {forWho(a)}</div>
            <ol className="help-steps">{a.steps.map((s) => <li key={s}>{s}</li>)}</ol>
            {a.tips?.map((t) => <div key={t} className="help-tip">💡 {t}</div>)}
            {a.go && canGo(a) && <button type="button" className="btn btn-sm btn-pri" style={{ marginTop: 10 }} onClick={() => go(a.go)}>{a.go.label} →</button>}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="stack help">
      <div className="page-head">
        <div><h2>Help Centre</h2><p className="muted small">Short guides for using Choir Cloud. Search, or open a guide below.</p></div>
      </div>
      <div className="search-box help-search">
        <Icon name="search" size={15} />
        <input aria-label="Search the Help Centre" placeholder="Search help: password, check in, vote…" value={q} onChange={(e) => setQ(e.target.value)} />
        {q && <button type="button" className="as-link small" onClick={() => setQ('')}>Clear</button>}
      </div>

      {found ? (
        <div className="card">
          <div className="lib-side-h">Results <span className="muted small">· {found.guides.length + found.faq.length}</span></div>
          {!found.guides.length && !found.faq.length && <p className="muted small">Nothing matches “{q}”. Try another word, or ask one of the people under “Still stuck?” below.</p>}
          <div className="help-list">{found.guides.map((a) => <Guide key={a.id} a={a} />)}</div>
          {found.faq.map(([qq, aa]) => <div key={qq} className="help-faq"><b>{qq}</b><p>{aa}</p></div>)}
        </div>
      ) : (
        <>
          {forYou.length > 0 && (
            <div className="card help-you">
              <div className="lib-side-h">Guides for you</div>
              <p className="muted tiny" style={{ margin: '2px 0 8px' }}>For your office{forYou.length > 1 ? 's' : ''}: {myRoles.filter((r) => ROLES[r] && r !== 'member').map((r) => ROLES[r].label).join(', ')}</p>
              <div className="help-list">{forYou.map((a) => <Guide key={a.id} a={a} />)}</div>
            </div>
          )}
          {HELP_GROUPS.map(([g, label]) => {
            const list = HELP_ARTICLES.filter((a) => a.group === g && !forYou.includes(a));
            if (!list.length) return null;
            return (
              <div key={g} className="card">
                <div className="lib-side-h">{label}</div>
                <div className="help-list">{list.map((a) => <Guide key={a.id} a={a} />)}</div>
              </div>
            );
          })}
          <div className="card">
            <div className="lib-side-h">Common questions</div>
            {HELP_FAQ.map(([qq, aa]) => <details key={qq} className="help-q"><summary>{qq}</summary><p>{aa}</p></details>)}
          </div>
        </>
      )}

      <div className="help-two">
        <div className="card">
          <div className="lib-side-h"><Icon name="shield" size={14} /> Staying safe</div>
          <ul className="help-safe">{HELP_SAFETY.map((s) => <li key={s}>{s}</li>)}</ul>
        </div>
        <div className="card">
          <div className="lib-side-h"><Icon name="users" size={14} /> Still stuck? Who to ask</div>
          <ul className="help-safe">
            <li><b>Signing in, new accounts, roles:</b> the President or Provost.</li>
            <li><b>Music, scores and recordings:</b> the Custodian or Choir Master.</li>
            <li><b>Dues, debts and receipts:</b> the Provost, Finance Secretary or Secretary.</li>
            <li><b>Elections:</b> the Electoral Committee.</li>
            <li><b>Something broken or a security worry:</b> the admin.</li>
          </ul>
          <p className="muted tiny" style={{ marginBottom: 0 }}>Send them a private chat from Messages at the bottom right.</p>
        </div>
      </div>
    </div>
  );
}
