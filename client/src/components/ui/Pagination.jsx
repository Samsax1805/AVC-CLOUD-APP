import React, { useEffect, useState } from 'react';

// Slices a list into pages. Pass `resetKey` (e.g. the current filters) to jump
// back to page 1 when it changes; the page is also clamped when the list shrinks.
export function usePaged(items, pageSize = 10, resetKey = '') {
  const [page, setPage] = useState(1);
  const list = items || [];
  const pages = Math.max(1, Math.ceil(list.length / pageSize));
  useEffect(() => { setPage(1); }, [resetKey]);
  useEffect(() => { if (page > pages) setPage(pages); }, [page, pages]);
  const cur = Math.min(page, pages);
  return { page: cur, setPage, pages, total: list.length, pageSize, items: list.slice((cur - 1) * pageSize, cur * pageSize) };
}

// Page numbers with ellipses, e.g. 1 … 4 5 6 … 12
const pageList = (page, pages) => {
  const out = [];
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - page) <= 1) out.push(i);
    else if (out[out.length - 1] !== '…') out.push('…');
  }
  return out;
};

export default function Pagination({ paged, label = 'items' }) {
  const { page, setPage, pages, total, pageSize } = paged;
  if (total <= pageSize) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="pager">
      <span className="muted small">{from}–{to} of {total} {label}</span>
      <div className="pager-btns">
        <button className="pager-btn" disabled={page === 1} onClick={() => setPage(page - 1)} aria-label="Previous page">‹</button>
        {pageList(page, pages).map((p, i) => (p === '…'
          ? <span key={`gap${i}`} className="pager-gap">…</span>
          : <button key={p} className={`pager-btn ${p === page ? 'on' : ''}`} onClick={() => setPage(p)} aria-current={p === page ? 'page' : undefined}>{p}</button>))}
        <button className="pager-btn" disabled={page === pages} onClick={() => setPage(page + 1)} aria-label="Next page">›</button>
      </div>
    </div>
  );
}
