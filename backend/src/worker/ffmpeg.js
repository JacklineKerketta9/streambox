const { spawn } = require('child_process');
const fs = require('fs/promises');
const path = require('path');
const { pickRenditions, buildMasterPlaylist } = require('./hls');

// rejects with the end of stderr, which is where ffmpeg puts the actual error
function run(cmd, args, { collectStdout = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { if (collectStdout) stdout += d; });
    child.stderr.on('data', (d) => { stderr = (stderr + d).slice(-2000); });
    child.on('error', reject); // e.g. ffmpeg not installed
    child.on('close', (code) =>
      code === 0 ? resolve(stdout) : reject(new Error(`${cmd} exited with code ${code}: ${stderr.trim()}`))
    );
  });
}

// also rejects files that aren't video before we waste time encoding
async function probe(file) {
  const out = await run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file], { collectStdout: true });
  const info = JSON.parse(out);
  const video = (info.streams || []).find((s) => s.codec_type === 'video');
  if (!video || !video.width || !video.height) throw new Error('No video stream found in upload');
  return { width: video.width, height: video.height, durationSec: Math.round(parseFloat(info.format.duration) || 0) };
}

async function encodeRendition(input, outDir, r) {
  await fs.mkdir(outDir, { recursive: true });
  await run('ffmpeg', [
    '-y', '-i', input,
    '-map', '0:v:0', '-map', '0:a:0?', // first video stream, first audio stream if present
    '-vf', `scale=-2:${r.height}`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-profile:v', 'main', '-pix_fmt', 'yuv420p',
    '-b:v', `${r.videoKbps}k`, '-maxrate', `${Math.round(r.videoKbps * 1.07)}k`, '-bufsize', `${r.videoKbps * 2}k`,
    '-g', '48', '-keyint_min', '48', '-sc_threshold', '0', // fixed keyframe spacing so quality switches line up
    '-c:a', 'aac', '-b:a', `${r.audioKbps}k`, '-ac', '2',
    '-f', 'hls', '-hls_time', '6', '-hls_playlist_type', 'vod',
    '-hls_segment_filename', path.join(outDir, 'seg_%03d.ts'),
    path.join(outDir, 'index.m3u8'),
  ]);
}

// input file -> outDir/{360p,720p,...}/index.m3u8 + outDir/master.m3u8
async function transcodeToHls(input, outDir, onProgress = async () => {}) {
  const meta = await probe(input);
  const renditions = pickRenditions(meta.height);
  await onProgress(5);

  for (let i = 0; i < renditions.length; i++) {
    await encodeRendition(input, path.join(outDir, renditions[i].name), renditions[i]);
    await onProgress(Math.round(5 + (80 * (i + 1)) / renditions.length));
  }

  await fs.writeFile(path.join(outDir, 'master.m3u8'), buildMasterPlaylist(renditions, meta.width, meta.height));
  return { ...meta, renditions: renditions.map((r) => r.name) };
}

module.exports = { run, probe, transcodeToHls };
