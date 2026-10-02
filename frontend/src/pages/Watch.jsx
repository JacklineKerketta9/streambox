import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Hls from 'hls.js';
import { api, errorMessage } from '../api.js';

const HEARTBEAT_MS = 15000;
const formatTime = (seconds) => {
  if (!Number.isFinite(seconds)) return '0:00';
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

function PlayerIcon({ name }) {
  const paths = {
    play: <path d="M8 5v14l11-7z" fill="currentColor" stroke="none" />,
    pause: <path d="M7 5h4v14H7zM15 5h4v14h-4z" fill="currentColor" stroke="none" />,
    volume: <><path d="M4 10v4h4l5 4V6l-5 4H4z" /><path d="M16 9a5 5 0 0 1 0 6M18 6a9 9 0 0 1 0 12" /></>,
    mute: <><path d="M4 10v4h4l5 4V6l-5 4H4z" /><path d="m17 9 5 6m0-6-5 6" /></>,
    quality: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.7a8 8 0 0 1-1.8 1l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.8-1l-1.7.7-1.4-2.4 1.4-1.1a7 7 0 0 1 0-2l-1.4-1.1 1.4-2.4 1.7.7a8 8 0 0 1 1.8-1l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.8 1l1.7-.7 1.4 2.4-1.4 1.1a7 7 0 0 1 0 2Z" transform="translate(-1 -1) scale(1.08)" /></>,
    fullscreen: <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export default function Watch() {
  const { id } = useParams();
  const videoRef = useRef(null);
  const playerRef = useRef(null);
  const hlsRef = useRef(null);
  const [title, setTitle] = useState(null);
  const [error, setError] = useState('');
  const [levels, setLevels] = useState([]);
  const [quality, setQuality] = useState('-1');
  const [nativeHls, setNativeHls] = useState(false);
  const [activeLevel, setActiveLevel] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [qualityMenuOpen, setQualityMenuOpen] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    setLevels([]);
    setQuality('-1');
    setActiveLevel(null);
    setNativeHls(false);
    let hls;
    let timer;
    let cancelled = false;
    const onPause = () => save();
    const onEnded = () => save();

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
          hlsRef.current = hls;
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            setLevels(hls.levels.map((level, index) => ({ index, height: level.height, bitrate: level.bitrate })));
          });
          hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => setActiveLevel(hls.levels[data.level]?.height || null));
          hls.loadSource(playback.url);
          hls.attachMedia(video);
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          setNativeHls(true);
          video.src = playback.url; // Safari plays HLS natively
        } else {
          setError('This browser cannot play HLS streams.');
        }

        timer = setInterval(() => !video.paused && save(), HEARTBEAT_MS);
        video.addEventListener('pause', onPause);
        video.addEventListener('ended', onEnded);
      } catch (e) {
        setError(errorMessage(e));
      }
    })();

    return () => {
      cancelled = true;
      clearInterval(timer);
      save();
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);
      if (hls) hls.destroy();
      hlsRef.current = null;
    };
  }, [id]);

  const changeQuality = (value) => {
    setQuality(String(value));
    if (hlsRef.current) hlsRef.current.currentLevel = Number(value);
    setQualityMenuOpen(false);
  };

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  };

  const seek = (event) => {
    const value = Number(event.target.value);
    if (videoRef.current) videoRef.current.currentTime = value;
    setCurrentTime(value);
  };

  const changeVolume = (event) => {
    const value = Number(event.target.value);
    if (videoRef.current) {
      videoRef.current.volume = value;
      videoRef.current.muted = value === 0;
    }
    setVolume(value);
    setMuted(value === 0);
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    if (!video.muted && video.volume === 0) video.volume = 0.5;
    setMuted(video.muted);
    setVolume(video.volume);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) playerRef.current?.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  return (
    <div className="watch">
      <Link to="/" className="muted">← Back</Link>
      {error ? <p className="error">{error}</p> : (
        <>
          <div className="video-player" ref={playerRef}>
            <video ref={videoRef} autoPlay playsInline
              onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
              onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
              onDurationChange={(event) => setDuration(event.currentTarget.duration)}
              onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} />
            <div className="player-controls">
              <button type="button" className="player-button" onClick={togglePlayback} aria-label={isPlaying ? 'Pause' : 'Play'}>
                <PlayerIcon name={isPlaying ? 'pause' : 'play'} />
              </button>
              <input className="seek-bar" type="range" min="0" max={duration || 0} step="0.1" value={Math.min(currentTime, duration || 0)}
                onChange={seek} aria-label="Playback position" />
              <span className="player-time">{formatTime(currentTime)} / {formatTime(duration)}</span>
              <button type="button" className="player-button volume-button" onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'}>
                <PlayerIcon name={muted ? 'mute' : 'volume'} />
              </button>
              <input className="volume-bar" type="range" min="0" max="1" step="0.05" value={muted ? 0 : volume}
                onChange={changeVolume} aria-label="Volume" />
              <div className="quality-control">
                <button type="button" className={`player-button${qualityMenuOpen ? ' active' : ''}`} onClick={() => setQualityMenuOpen((open) => !open)}
                  aria-label="Video quality" aria-expanded={qualityMenuOpen} title="Video quality">
                  <PlayerIcon name="quality" />
                </button>
                {qualityMenuOpen && (
                  <div className="quality-menu" role="group" aria-label="Video quality">
                    <button type="button" className={quality === '-1' ? 'selected' : ''} onClick={() => changeQuality(-1)}>
                      Auto{activeLevel ? ` (${activeLevel}p)` : nativeHls ? ' (Browser)' : ''}
                    </button>
                    {!nativeHls && levels.map((level) => (
                      <button type="button" key={level.index} className={quality === String(level.index) ? 'selected' : ''}
                        onClick={() => changeQuality(level.index)}>{level.height}p</button>
                    ))}
                  </div>
                )}
              </div>
              <button type="button" className="player-button" onClick={toggleFullscreen} aria-label="Fullscreen">
                <PlayerIcon name="fullscreen" />
              </button>
            </div>
          </div>
        </>
      )}
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
