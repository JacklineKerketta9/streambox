const fs = require('fs');
const { pipeline } = require('stream/promises');
const {
  S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, HeadBucketCommand,
  CreateBucketCommand, DeleteBucketPolicyCommand, ListObjectsV2Command, DeleteObjectsCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const env = require('../config/env');

const base = {
  region: 'us-east-1',
  forcePathStyle: true, // MinIO uses path-style URLs
  credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
  // newer SDK versions add checksum params that MinIO and browser PUTs choke on
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
};

// A presigned URL is signed for one host. The API reaches MinIO as minio:9000, but the browser
// needs localhost:9000, so presigning goes through a second client.
const internal = new S3Client({ ...base, endpoint: env.S3_ENDPOINT });
const signer = new S3Client({ ...base, endpoint: env.S3_PUBLIC_ENDPOINT });

const Bucket = env.S3_BUCKET;

async function ensureBucket() {
  try {
    await internal.send(new HeadBucketCommand({ Bucket }));
  } catch {
    await internal.send(new CreateBucketCommand({ Bucket }));
  }
  // Signed playback is served through the API, so the bucket and its objects remain private.
  await internal.send(new DeleteBucketPolicyCommand({ Bucket })).catch(() => {});
}

const presignPut = (Key, ContentType, expiresIn = 3600) =>
  getSignedUrl(signer, new PutObjectCommand({ Bucket, Key, ContentType }), { expiresIn });

async function headObject(Key) {
  try {
    const res = await internal.send(new HeadObjectCommand({ Bucket, Key }));
    return { size: res.ContentLength };
  } catch {
    return null;
  }
}

async function downloadToFile(Key, dest) {
  const res = await internal.send(new GetObjectCommand({ Bucket, Key }));
  await pipeline(res.Body, fs.createWriteStream(dest));
}

async function getObject(Key) {
  return internal.send(new GetObjectCommand({ Bucket, Key }));
}

async function uploadFile(Key, filePath, ContentType) {
  const { size } = await fs.promises.stat(filePath);
  await internal.send(
    new PutObjectCommand({ Bucket, Key, Body: fs.createReadStream(filePath), ContentLength: size, ContentType })
  );
}

// clears output from an earlier attempt before re-uploading
async function deletePrefix(Prefix) {
  let ContinuationToken;
  do {
    const page = await internal.send(new ListObjectsV2Command({ Bucket, Prefix, ContinuationToken }));
    const Objects = (page.Contents || []).map(({ Key }) => ({ Key }));
    if (Objects.length) await internal.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects } }));
    ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (ContinuationToken);
}

const publicUrl = (key) => `${env.S3_PUBLIC_ENDPOINT}/${Bucket}/${key}`;

module.exports = { ensureBucket, presignPut, headObject, getObject, downloadToFile, uploadFile, deletePrefix, publicUrl };
