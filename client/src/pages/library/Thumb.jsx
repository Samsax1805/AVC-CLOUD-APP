import React, { useEffect, useRef, useState } from 'react';
import Icon from '../../components/ui/Icon';
import api from '../../services/api';
import { previewFromStored } from '../../services/files';

// A song's first-page picture. Loaded only when the card comes into view (and kept by the browser for a day).
// For officers, a song that has a score but no picture yet gets one drawn here from the stored file and saved,
// one at a time, so pictures missing from earlier uploads fill themselves in.
const seen = new Map(); // uid → object URL
let drawing = Promise.resolve();
const drawOnce = (fn) => { const p = drawing.then(fn, fn); drawing = p.catch(() => {}); return p; };

export const savePicture = (uid, fid, data) => api.post(`/library/items/${uid}/preview`, { fid, data });

export default function Thumb({ uid, has, scope = 'catalogue', draw, canDraw, alt, className = '' }) {
  const box = useRef(null);
  const [src, setSrc] = useState(seen.get(uid) || '');
  useEffect(() => {
    if (src || !box.current) return undefined;
    if (!has && !(canDraw && draw)) return undefined;
    let live = true;
    const io = new IntersectionObserver(async ([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      try {
        if (has) {
          const { data } = await api.get(`/library/${scope === 'catalogue' ? 'catalogue' : 'items'}/${uid}/preview`, { responseType: 'blob' });
          const u = URL.createObjectURL(data); seen.set(uid, u); if (live) setSrc(u);
        } else {
          const pic = await drawOnce(() => previewFromStored(draw.id, draw.name, draw.mime));
          if (!pic) return;
          await savePicture(uid, draw.fid, pic);
          seen.set(uid, pic); if (live) setSrc(pic);
        }
      } catch { /* no picture: the placeholder stays */ }
    }, { rootMargin: '200px' });
    io.observe(box.current);
    return () => { live = false; io.disconnect(); };
  }, [uid, has, scope, draw, canDraw, src]);
  return (
    <span ref={box} className={`lib-thumb ${src ? 'has' : ''} ${className}`}>
      {src ? <img src={src} alt={alt || 'First page'} loading="lazy" /> : <Icon name="music" size={22} />}
    </span>
  );
}

// Remembers a picture just drawn on this device (so it shows at once, before the server copy is fetched)
export const rememberPicture = (uid, data) => { if (data) seen.set(uid, data); };
