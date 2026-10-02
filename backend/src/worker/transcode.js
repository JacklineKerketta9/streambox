const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const prisma = require('../db/prisma');
const logger = require('../config/logger');
const { downloadToFile, uploadFile, deletePrefix } = require('../storage/s3');
const { transcodeToHls } = require('./ffmpeg');
const { invalidateHome } = require('../modules/catalog/homeCache');

const CONTENT_TYPES = { '.m3u8': 'application/vnd.apple.mpegurl', '.ts': 'video/mp2t' };

async function listFiles(dir, rel = '') {
  const out = [];
  for (const entry of await fs.readdir(path.join(dir, rel), { withFileTypes: true })) {
    const p = path.join(rel, entry.name);
    if (entry.isDirectory()) out.push(...(await listFiles(dir, p)));
    else out.push(p);
  }
  return out;
}

// segments first, playlists last, so a manifest never points at missing files
async function uploadDir(dir, prefix) {
  const files = (await listFiles(dir)).sort((a, b) => Number(a.endsWith('.m3u8')) - Number(b.endsWith('.m3u8')));
  for (const file of files) {
    const key = prefix + file.split(path.sep).join('/');
    await uploadFile(key, path.join(dir, file), CONTENT_TYPES[path.extname(file)] || 'application/octet-stream');
  }
}

const setProgress = (id, progress) => prisma.videoAsset.update({ where: { id }, data: { progress } });

// one job = one asset; safe to re-run
async function processTranscode(job) {
  const { assetId } = job.data;
  const asset = await prisma.videoAsset.findUnique({ where: { id: assetId } });
  if (!asset) throw new Error(`Asset ${assetId} not found`);

  await prisma.videoAsset.update({
    where: { id: assetId },
    data: { status: 'processing', progress: 1, attempts: job.attemptsMade + 1, error: null },
  });

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), `transcode-${assetId}-`));
  try {
    const input = path.join(tmp, 'source');
    const outDir = path.join(tmp, 'out');
    await downloadToFile(asset.sourceKey, input);

    const result = await transcodeToHls(input, outDir, (pct) => setProgress(assetId, pct));

    const prefix = `hls/${assetId}/`;
    await deletePrefix(prefix);
    await uploadDir(outDir, prefix);

    const manifestKey = `${prefix}master.m3u8`;
    await prisma.$transaction([
      prisma.videoAsset.update({
        where: { id: assetId },
        data: { status: 'ready', progress: 100, manifestKey, durationSec: result.durationSec, renditions: result.renditions, error: null },
      }),
      // playback reads Title.videoUrl, so publish and mark ready together
      prisma.title.update({
        where: { id: asset.titleId },
        data: { videoUrl: manifestKey, durationMin: Math.max(1, Math.round(result.durationSec / 60)) },
      }),
    ]);
    await invalidateHome();
    logger.info({ assetId, renditions: result.renditions }, 'Transcode complete');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

// BullMQ handles the retries; only the last failure marks the asset failed
async function handleFailure(job, err) {
  if (!job) return;
  const { assetId } = job.data;
  const willRetry = job.attemptsMade < (job.opts.attempts || 1) && !/stalled/i.test(err.message);
  logger.error({ assetId, attempt: job.attemptsMade, willRetry, err: err.message }, 'Transcode attempt failed');
  await prisma.videoAsset
    .update({
      where: { id: assetId },
      data: { status: willRetry ? 'queued' : 'failed', progress: 0, error: err.message.slice(0, 1000) },
    })
    .catch((e) => logger.error({ e }, 'Could not record failure'));
}

module.exports = { processTranscode, handleFailure };
