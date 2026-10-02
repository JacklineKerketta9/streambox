import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import Hls from 'hls.js';
import { useList } from '../lists.jsx';
import { formatDuration, posterStyle } from '../lib.js';
import { api } from '../api.js';

const hoverPosition = (rect) => {
  const width = Math.min(360, window.innerWidth - 32);
  const estimatedHeight = 390;
  const centered = rect.left + rect.width / 2 - width / 2;
  const left = Math.max(16, Math.min(centered, window.innerWidth - width - 16));
  const top = Math.max(16, Math.min(rect.top - 24, window.innerHeight - estimatedHeight - 16));
  return { left, top, width };
};

export default function TitleCard({ title }) {
  const { has, toggle } = useList();
  const [previewUrl, setPreviewUrl] = useState(null);
  const [popupPosition, setPopupPosition] = useState(null);
  const anchorRef = useRef(null);
  const videoRef = useRef(null);
  const hoveredRef = useRef(false);
  const requestedRef = useRef(false);
  const closeTimerRef = useRef(null);
  const previewTimerRef = useRef(null);
  const saved = has(title.id);
  const poster = posterStyle(title, true);

  useEffect(() => {
    if (!previewUrl || !videoRef.current) return undefined;
    const video = videoRef.current;
    let hls;
    let previewTimer;
    const startPreview = () => {
      video.currentTime = 0;
      video.play().catch(() => {});
      previewTimer = setTimeout(() => setPreviewUrl(null), 8000);
    };

    if (Hls.isSupported()) {
      hls = new Hls();
      hls.on(Hls.Events.MANIFEST_PARSED, startPreview);
      hls.loadSource(previewUrl);
      hls.attachMedia(video);
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = previewUrl;
      video.addEventListener('loadedmetadata', startPreview, { once: true });
    }

    return () => {
      clearTimeout(previewTimer);
      if (hls) hls.destroy();
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [previewUrl]);

  const startHoverPreview = (event) => {
    hoveredRef.current = true;
    clearTimeout(closeTimerRef.current);
    anchorRef.current = event.currentTarget;
    setPopupPosition(hoverPosition(anchorRef.current.getBoundingClientRect()));
    if (!title.playable || requestedRef.current) return;
    previewTimerRef.current = setTimeout(() => {
      if (!hoveredRef.current || requestedRef.current) return;
      requestedRef.current = true;
      api(`/playback/${title.id}`).then(({ url }) => {
        if (hoveredRef.current) setPreviewUrl(url);
      }).catch(() => {});
    }, 500);
  };

  const closeHoverCard = () => {
    hoveredRef.current = false;
    clearTimeout(previewTimerRef.current);
    requestedRef.current = false;
    setPreviewUrl(null);
    setPopupPosition(null);
    anchorRef.current = null;
  };

  const delayClose = () => {
    clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(closeHoverCard, 140);
  };

  const keepOpen = () => {
    hoveredRef.current = true;
    clearTimeout(closeTimerRef.current);
  };

  useEffect(() => {
    if (!popupPosition) return undefined;
    const reposition = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) {
        closeHoverCard();
        return;
      }
      setPopupPosition(hoverPosition(rect));
    };
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [Boolean(popupPosition)]);

  useEffect(() => () => {
    clearTimeout(closeTimerRef.current);
    clearTimeout(previewTimerRef.current);
  }, []);

  return (
    <div className="card">
      <Link ref={anchorRef} to={`/watch/${title.id}`} className="poster" style={poster}
        onMouseEnter={startHoverPreview} onMouseLeave={delayClose}>
        <span className="poster-name">{title.name}</span>
        {!title.playable && <span className="soon">Coming soon</span>}
        {title.progress > 0 && (
          <div className="bar"><i style={{ width: `${Math.min(100, title.progress * 100)}%` }} /></div>
        )}
      </Link>
      <div className="meta">
        <span className="muted small">{[title.year, title.genres.slice(0, 2).join(', ')].filter(Boolean).join(' · ')}</span>
        <button className={`icon${saved ? ' on' : ''}`} onClick={() => toggle(title.id, title).catch(() => {})}
          title={saved ? 'Remove from My List' : 'Add to My List'}>
          {saved ? '✓' : '+'}
        </button>
      </div>
      {popupPosition && createPortal(
        <article className="hover-preview-card" style={popupPosition} onMouseEnter={keepOpen} onMouseLeave={delayClose}
          onFocus={keepOpen} onBlur={delayClose}>
          <Link to={`/watch/${title.id}`} className="hover-preview-art" style={poster} onClick={closeHoverCard}>
            <video ref={videoRef} muted playsInline preload="none" aria-hidden="true" />
            <span className="hover-preview-name">{title.name}</span>
          </Link>
          <div className="hover-preview-content">
            <div className="hover-actions">
              <Link to={`/watch/${title.id}`} className="preview-play" onClick={closeHoverCard}
                aria-label={`Play ${title.name}`} title="Play"><span aria-hidden="true">▶</span></Link>
              <button className={`preview-action${saved ? ' selected' : ''}`} onClick={() => toggle(title.id, title).catch(() => {})}
                aria-label={saved ? 'Remove from My List' : 'Add to My List'}
                title={saved ? 'Remove from My List' : 'Add to My List'}>{saved ? '✓' : '+'}</button>
              <Link to={`/watch/${title.id}`} className="preview-action preview-more" onClick={closeHoverCard}
                aria-label="More information" title="More information">⌄</Link>
            </div>
            <div className="hover-meta">
              {title.year && <span>{title.year}</span>}
              {title.durationMin && <span>{formatDuration(title.durationMin)}</span>}
              {title.playable && <span className="quality-tag">HLS</span>}
            </div>
            <p className="hover-genres">{title.genres.join(' · ')}</p>
            {title.description && <p className="hover-description">{title.description}</p>}
          </div>
        </article>,
        document.body
      )}
    </div>
  );
}
