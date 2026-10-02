import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Hls from 'hls.js';
import { useList } from '../lists.jsx';
import { posterStyle } from '../lib.js';
import { api } from '../api.js';

export default function TitleCard({ title }) {
  const { has, toggle } = useList();
  const [previewUrl, setPreviewUrl] = useState(null);
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const hoveredRef = useRef(false);
  const requestedRef = useRef(false);
  const saved = has(title.id);
  const poster = posterStyle(title);

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
      hls = new Hls({ autoStartLoad: true });
      hlsRef.current = hls;
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
      hlsRef.current = null;
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [previewUrl]);

  const startHoverPreview = () => {
    hoveredRef.current = true;
    if (!title.playable || requestedRef.current) return;
    requestedRef.current = true;
    api(`/playback/${title.id}`).then(({ url }) => {
      if (hoveredRef.current) setPreviewUrl(url);
    }).catch(() => {});
  };

  const stopHoverPreview = () => {
    hoveredRef.current = false;
    requestedRef.current = false;
    setPreviewUrl(null);
  };

  return (
    <div className="card">
      <Link to={`/watch/${title.id}`} className={`poster${previewUrl ? ' previewing' : ''}`} style={poster}
        onMouseEnter={startHoverPreview} onMouseLeave={stopHoverPreview}>
        <video ref={videoRef} className="card-preview" muted playsInline preload="none" aria-hidden="true" />
        <span className="poster-name">{title.name}</span>
        {!title.playable && <span className="soon">Coming soon</span>}
        {title.progress > 0 && (
          <div className="bar"><i style={{ width: `${Math.min(100, title.progress * 100)}%` }} /></div>
        )}
      </Link>
      <div className="meta">
        <span className="muted small">{title.year} · {title.genres.slice(0, 2).join(', ')}</span>
        <button className={`icon${saved ? ' on' : ''}`} onClick={() => toggle(title.id)}
          title={saved ? 'Remove from My List' : 'Add to My List'}>
          {saved ? '✓' : '+'}
        </button>
      </div>
    </div>
  );
}
