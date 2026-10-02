import { useEffect, useState } from 'react';
import { api, errorMessage } from '../api.js';
import { useAuth } from '../auth.jsx';

// fetch() can't report upload progress, so the file goes up through XHR
function putFile(url, file, type, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', type);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error('Upload failed. Is MinIO running on :9000?'));
    xhr.send(file);
  });
}

const STATUS_LABEL = {
  pending_upload: 'Waiting for upload',
  queued: 'Queued',
  processing: 'Transcoding',
  ready: 'Ready',
  failed: 'Failed',
};

export default function Studio() {
  const { user } = useAuth();
  const [titles, setTitles] = useState([]);
  const [assets, setAssets] = useState([]);
  const [titleId, setTitleId] = useState('');
  const [file, setFile] = useState(null);
  const [pct, setPct] = useState(null);
  const [note, setNote] = useState('');
  const [form, setForm] = useState({ name: '', description: '', year: new Date().getFullYear(), genres: '' });

  const loadTitles = () =>
    api('/titles?limit=50').then((d) => {
      setTitles(d.items);
      setTitleId((cur) => cur || (d.items[0] && d.items[0].id) || '');
    });
  const loadAssets = () => api('/admin/assets').then((d) => setAssets(d.assets)).catch(() => {});

  useEffect(() => {
    loadTitles();
    loadAssets();
    const timer = setInterval(loadAssets, 3000);
    return () => clearInterval(timer);
  }, []);

  if (user.role !== 'admin') return <p className="pad error">Studio is for admins only.</p>;

  const createTitle = async (e) => {
    e.preventDefault();
    setNote('');
    try {
      const { title } = await api('/admin/titles', {
        method: 'POST',
        body: {
          name: form.name,
          description: form.description,
          year: Number(form.year),
          genres: form.genres.split(',').map((g) => g.trim()).filter(Boolean),
        },
      });
      setForm({ ...form, name: '', description: '', genres: '' });
      await loadTitles();
      setTitleId(title.id);
      setNote(`Created "${title.name}". Now upload a video for it.`);
    } catch (err) {
      setNote(errorMessage(err));
    }
  };

  const upload = async () => {
    setNote('');
    setPct(0);
    const type = file.type || 'video/mp4';
    try {
      const { assetId, uploadUrl } = await api(`/admin/titles/${titleId}/upload`, {
        method: 'POST',
        body: { filename: file.name, contentType: type },
      });
      await putFile(uploadUrl, file, type, setPct);
      await api(`/admin/assets/${assetId}/complete`, { method: 'POST' });
      setFile(null);
      setNote('Upload finished, transcoding has started.');
      loadAssets();
    } catch (err) {
      setNote(errorMessage(err));
    } finally {
      setPct(null);
    }
  };

  const retry = (id) => api(`/admin/assets/${id}/retry`, { method: 'POST' }).then(loadAssets).catch((e) => setNote(errorMessage(e)));

  return (
    <div className="pad studio">
      <h1>Studio</h1>

      <div className="panels">
        <section className="panel">
          <h2>1. Add a title</h2>
          <form onSubmit={createTitle} className="stack">
            <input placeholder="Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <textarea placeholder="Description" required rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <div className="two">
              <input type="number" placeholder="Year" required value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} />
              <input placeholder="Genres, comma separated" value={form.genres} onChange={(e) => setForm({ ...form, genres: e.target.value })} />
            </div>
            <button className="btn sm">Create title</button>
          </form>
        </section>

        <section className="panel">
          <h2>2. Upload a video</h2>
          <div className="stack">
            <select value={titleId} onChange={(e) => setTitleId(e.target.value)}>
              {titles.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.year})</option>)}
            </select>
            <input type="file" accept="video/*" onChange={(e) => setFile(e.target.files[0] || null)} />
            {pct !== null && <div className="meter"><i style={{ width: `${pct}%` }} /></div>}
            <button className="btn sm" disabled={!file || !titleId || pct !== null} onClick={upload}>
              {pct !== null ? `Uploading ${pct}%` : 'Upload and transcode'}
            </button>
          </div>
        </section>
      </div>

      {note && <p className="note">{note}</p>}

      <h2>Transcoding jobs</h2>
      <table className="table">
        <thead>
          <tr><th>Title</th><th>Status</th><th>Progress</th><th>Qualities</th><th /></tr>
        </thead>
        <tbody>
          {assets.map((a) => (
            <tr key={a.id}>
              <td>{a.titleName}</td>
              <td>
                <span className={`badge ${a.status}`}>{STATUS_LABEL[a.status]}</span>
                {a.error && <div className="small error">{a.error}</div>}
              </td>
              <td style={{ width: 160 }}>
                {['queued', 'processing'].includes(a.status) && <div className="meter"><i style={{ width: `${a.progress}%` }} /></div>}
                {a.attempts > 1 && a.status !== 'ready' && <span className="small muted">attempt {a.attempts}</span>}
              </td>
              <td className="muted">{a.renditions ? a.renditions.join(', ') : '–'}</td>
              <td>{a.status === 'failed' && <button className="btn ghost sm" onClick={() => retry(a.id)}>Retry</button>}</td>
            </tr>
          ))}
          {!assets.length && <tr><td colSpan={5} className="muted">No uploads yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
