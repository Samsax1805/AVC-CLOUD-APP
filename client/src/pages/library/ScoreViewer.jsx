import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../../components/ui/Icon';
import { fileHere, openFile } from '../../services/files';
import { problem } from '../../services/library';

// Reads a score on the page itself: every page of a PDF (or a picture), zoom in and out, print, download.
// The file comes through the site's own address, as when opening it, so the storage link is never shown.
// The PDF reader loads only when someone opens a score.
const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5];
const isPdf = (f) => f.mime === 'application/pdf' || /\.pdf$/i.test(f.name || '');

export default function ScoreViewer({ file, title, toast, onClose }) {
  const box = useRef(null);
  const pdfRef = useRef(null);
  const [state, setState] = useState({ phase: 'loading' }); // loading · ready · failed
  const [pages, setPages] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [img, setImg] = useState('');
  const [printing, setPrinting] = useState(false);

  // load the file
  useEffect(() => {
    let live = true; let task;
    (async () => {
      try {
        const { url } = await fileHere(file.id, file.name);
        if (!isPdf(file)) { if (live) { setImg(url); setState({ phase: 'ready' }); } return; }
        const pdfjs = await import('pdfjs-dist');
        const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        const data = await (await fetch(url)).arrayBuffer();
        task = pdfjs.getDocument({ data });
        const pdf = await task.promise;
        if (!live) return;
        pdfRef.current = pdf; setPages(pdf.numPages); setState({ phase: 'ready' });
      } catch (e) { if (live) setState({ phase: 'failed', msg: problem(e, 'This score could not be shown') }); }
    })();
    return () => { live = false; pdfRef.current = null; task?.destroy().catch(() => {}); };
  }, [file]);

  // draw the pages to fit the width (times the zoom), one after another
  useEffect(() => {
    const pdf = pdfRef.current;
    if (state.phase !== 'ready' || !pdf || !box.current) return undefined;
    let stop = false;
    const width = Math.min(box.current.clientWidth - 24, 900) * zoom;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    (async () => {
      for (let n = 1; n <= pdf.numPages && !stop; n++) {
        const canvas = box.current?.querySelector(`canvas[data-page="${n}"]`);
        if (!canvas) continue;
        const page = await pdf.getPage(n);
        const base = page.getViewport({ scale: 1 });
        const vp = page.getViewport({ scale: (width / base.width) * ratio });
        canvas.width = vp.width; canvas.height = vp.height;
        canvas.style.width = `${Math.round(vp.width / ratio)}px`;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise.catch(() => {});
      }
    })();
    return () => { stop = true; };
  }, [state.phase, pages, zoom]);

  useEffect(() => {
    const key = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key, true); document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', key, true); document.body.style.overflow = ''; };
  }, [onClose]);

  // Printing: each page is drawn as a picture into a hidden frame and printed from there (works on phones too)
  const print = async () => {
    setPrinting(true);
    try {
      const shots = [];
      if (pdfRef.current) {
        const pdf = pdfRef.current;
        for (let n = 1; n <= pdf.numPages; n++) {
          const page = await pdf.getPage(n);
          const vp = page.getViewport({ scale: 2 });
          const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
          await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
          shots.push(c.toDataURL('image/jpeg', 0.9));
        }
      } else if (img) shots.push(img);
      const frame = document.createElement('iframe');
      frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
      document.body.appendChild(frame);
      const doc = frame.contentDocument;
      doc.open();
      doc.write(`<!doctype html><title>${String(title || 'Score').replace(/[<&]/g, '')}</title><style>@page{margin:8mm}body{margin:0}img{display:block;width:100%;page-break-after:always;break-after:page}img:last-child{page-break-after:auto;break-after:auto}</style>${shots.map((s) => `<img src="${s}">`).join('')}`);
      doc.close();
      await Promise.all([...doc.images].map((i) => (i.complete ? 0 : new Promise((r) => { i.onload = r; i.onerror = r; }))));
      frame.contentWindow.focus(); frame.contentWindow.print();
      setTimeout(() => frame.remove(), 60000);
    } catch (e) { toast?.(problem(e, 'Printing did not start'), 'err'); } finally { setPrinting(false); }
  };

  const zi = ZOOMS.indexOf(zoom);
  // drawn over the whole page (outside the song window, which is animated and would otherwise hold it)
  return createPortal(
    <div className="viewer" role="dialog" aria-modal="true" aria-label={`Score: ${title}`}>
      <div className="viewer-bar">
        <div className="viewer-t"><b>{title}</b><span className="muted tiny">{file.part ? `${file.kind} · ${file.part}` : file.name}{pages > 1 ? ` · ${pages} pages` : ''}</span></div>
        <div className="viewer-btns">
          <button type="button" className="icon-btn" aria-label="Zoom out" disabled={zi <= 0} onClick={() => setZoom(ZOOMS[zi - 1])}>−</button>
          <span className="tiny viewer-z">{Math.round(zoom * 100)}%</span>
          <button type="button" className="icon-btn" aria-label="Zoom in" disabled={zi >= ZOOMS.length - 1} onClick={() => setZoom(ZOOMS[zi + 1])}>+</button>
          <button type="button" className="btn btn-sm btn-soft" disabled={state.phase !== 'ready' || printing} onClick={print}>{printing ? 'Preparing…' : 'Print'}</button>
          <button type="button" className="btn btn-sm btn-soft" onClick={() => openFile(file.id, file.name).catch((e) => toast?.(problem(e), 'err'))}><Icon name="download" size={13} /> <span className="hide-sm">Open file</span></button>
          <button type="button" className="icon-btn" aria-label="Close the score" onClick={onClose}><Icon name="x" size={16} /></button>
        </div>
      </div>
      <div className="viewer-body" ref={box}>
        {state.phase === 'loading' && <p className="viewer-msg">Opening the score…</p>}
        {state.phase === 'failed' && <p className="viewer-msg">{state.msg}</p>}
        {state.phase === 'ready' && (img
          ? <img className="viewer-img" src={img} alt={title} style={{ width: `${Math.round(zoom * 100)}%`, maxWidth: zoom <= 1 ? 900 : 'none' }} />
          : Array.from({ length: pages }, (_, i) => <canvas key={i} data-page={i + 1} className="viewer-page" aria-label={`Page ${i + 1}`} />))}
      </div>
    </div>,
    document.body,
  );
}
