import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Hls from 'hls.js';
import { api, errorMessage } from '../api.js';

const HEARTBEAT_MS = 15000;

export default function Watch() {
  const { id } = useParams();
  const videoRef = useRef(null);
  const [title, setTitle] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const video = videoRef.current;
    let hls;
    let timer;
    let cancelled = false;

    // Progress heartbeat: every 15s while playing, plus on pause/end/leave.
    const save = () => {
      if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return;
      api('/progress', {
        method: 'POST',
        body: { titleId: id, positionSec: Math.floor(video.currentTime), durationSec: Math.floor(video.duration) },
      }).catch(() => {});
    };

    (async () => {
      try {
        const [playback, info] = await Promise.all([api(`/playback/${id}`), api(`/titles/${id}`)]);
        if (cancelled) return;
        setTitle(info.title);

        // Resume where the viewer left off.
        video.addEventListener('loadedmetadata', () => {
          if (playback.positionSec > 0 && playback.positionSec < video.duration - 5) {
            video.currentTime = playback.positionSec;
          }
        }, { once: true });

        if (Hls.isSupported()) {
          hls = new Hls();
          hls.loadSource(playback.url);
          hls.attachMedia(video);
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = playback.url; // Safari plays HLS natively
        } else {
          setError('This browser cannot play HLS streams.');
        }

        timer = setInterval(() => !video.paused && save(), HEARTBEAT_MS);
        video.addEventListener('pause', save);
        video.addEventListener('ended', save);
      } catch (e) {
        setError(errorMessage(e));
      }
    })();

    return () => {
      cancelled = true;
      clearInterval(timer);
      save();
      if (hls) hls.destroy();
    };
  }, [id]);

  return (
    <div className="watch">
      <Link to="/" className="muted">← Back</Link>
      {error ? <p className="error">{error}</p> : <video ref={videoRef} controls autoPlay playsInline />}
      {title && (
        <div className="info">
          <h1>{title.name}</h1>
          <p className="muted">
            {title.year}
            {title.durationMin ? ` · ${title.durationMin} min` : ''} · {title.genres.join(', ')}
          </p>
          <p>{title.description}</p>
        </div>
      )}
    </div>
  );
}
