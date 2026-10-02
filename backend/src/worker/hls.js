// The quality ladder and master-playlist builder. Pure functions, easy to unit test.
const LADDER = [
  { name: '360p', height: 360, videoKbps: 800, audioKbps: 96 },
  { name: '720p', height: 720, videoKbps: 2800, audioKbps: 128 },
  { name: '1080p', height: 1080, videoKbps: 5000, audioKbps: 128 },
];

// Never upscale beyond the source; always produce at least the lowest rung.
function pickRenditions(sourceHeight) {
  const picked = LADDER.filter((r) => r.height <= sourceHeight);
  return picked.length ? picked : [LADDER[0]];
}

// Keep the aspect ratio, and force an even width (H.264 requires even dimensions).
const renditionWidth = (srcW, srcH, h) => Math.round((srcW * h) / srcH / 2) * 2;

function buildMasterPlaylist(renditions, srcW, srcH) {
  const lines = ['#EXTM3U', '#EXT-X-VERSION:3'];
  for (const r of renditions) {
    const bandwidth = (r.videoKbps + r.audioKbps) * 1000;
    lines.push(`#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${renditionWidth(srcW, srcH, r.height)}x${r.height}`);
    lines.push(`${r.name}/index.m3u8`);
  }
  return lines.join('\n') + '\n';
}

module.exports = { LADDER, pickRenditions, buildMasterPlaylist, renditionWidth };
