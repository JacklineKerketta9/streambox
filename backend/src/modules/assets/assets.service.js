const crypto = require('crypto');
const prisma = require('../../db/prisma');
const AppError = require('../../utils/AppError');
const { presignPut, headObject } = require('../../storage/s3');
const { enqueueTranscode } = require('../../queue/transcodeQueue');

const formatAsset = (a) => ({
  id: a.id,
  titleId: a.titleId,
  titleName: a.title && a.title.name,
  status: a.status,
  progress: a.progress,
  attempts: a.attempts,
  error: a.error,
  durationSec: a.durationSec,
  renditions: a.renditions,
  createdAt: a.createdAt,
  updatedAt: a.updatedAt,
});

const withTitle = { title: { select: { name: true } } };

async function getAssetOrThrow(id) {
  const asset = await prisma.videoAsset.findUnique({ where: { id }, include: withTitle });
  if (!asset) throw new AppError(404, 'Asset not found');
  return asset;
}

// the browser uploads straight to storage with this URL
async function createUpload(titleId, { filename, contentType }) {
  if (!(await prisma.title.findUnique({ where: { id: titleId } }))) throw new AppError(404, 'Title not found');

  const id = crypto.randomUUID();
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100);
  const sourceKey = `raw/${id}/${safeName}`;
  await prisma.videoAsset.create({ data: { id, titleId, sourceKey, status: 'pending_upload' } });

  return { assetId: id, uploadUrl: await presignPut(sourceKey, contentType), contentType };
}

// called once the browser has finished the PUT
async function completeUpload(id) {
  const asset = await getAssetOrThrow(id);
  if (asset.status !== 'pending_upload') throw new AppError(409, `Asset is already ${asset.status}`);
  if (!(await headObject(asset.sourceKey))) throw new AppError(400, 'Upload not found in storage');

  await prisma.videoAsset.update({ where: { id }, data: { status: 'queued', progress: 0, error: null } });
  try {
    await enqueueTranscode(id);
  } catch (err) {
    // queue unavailable: go back to pending so complete can be called again
    await prisma.videoAsset.update({ where: { id }, data: { status: 'pending_upload' } });
    throw new AppError(503, 'Could not queue the transcoding job, try again');
  }
  return formatAsset(await getAssetOrThrow(id));
}

async function retry(id) {
  const asset = await getAssetOrThrow(id);
  if (asset.status !== 'failed') throw new AppError(409, 'Only failed assets can be retried');
  await prisma.videoAsset.update({ where: { id }, data: { status: 'queued', progress: 0, attempts: 0, error: null } });
  await enqueueTranscode(id);
  return formatAsset(await getAssetOrThrow(id));
}

async function listAssets() {
  const assets = await prisma.videoAsset.findMany({ orderBy: { createdAt: 'desc' }, take: 50, include: withTitle });
  return assets.map(formatAsset);
}

module.exports = { createUpload, completeUpload, retry, listAssets, getAsset: async (id) => formatAsset(await getAssetOrThrow(id)) };
