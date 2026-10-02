const { Queue } = require('bullmq');
const { createConnection } = require('./connection');

const QUEUE_NAME = 'transcode';
let queue;

// created on first use so tests don't need Redis
const getQueue = () => (queue ||= new Queue(QUEUE_NAME, { connection: createConnection() }));

// jobId = assetId, so an asset never has two live jobs
async function enqueueTranscode(assetId) {
  const q = getQueue();
  const existing = await q.getJob(assetId);
  if (existing) await existing.remove().catch(() => {}); // lets a retry reuse the id
  await q.add('transcode', { assetId }, {
    jobId: assetId,
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 }, // 5s, 10s
    removeOnComplete: 100,
  });
}

module.exports = { QUEUE_NAME, enqueueTranscode };
