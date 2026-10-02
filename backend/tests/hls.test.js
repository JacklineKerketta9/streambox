const { pickRenditions, buildMasterPlaylist, renditionWidth } = require('../src/worker/hls');

describe('quality ladder', () => {
  it('never upscales', () => {
    expect(pickRenditions(1080).map((r) => r.name)).toEqual(['360p', '720p', '1080p']);
    expect(pickRenditions(720).map((r) => r.name)).toEqual(['360p', '720p']);
    expect(pickRenditions(480).map((r) => r.name)).toEqual(['360p']);
  });

  it('always returns at least the lowest rung', () => {
    expect(pickRenditions(144).map((r) => r.name)).toEqual(['360p']);
  });

  it('keeps aspect ratio with even widths', () => {
    expect(renditionWidth(1920, 1080, 720)).toBe(1280);
    expect(renditionWidth(640, 480, 360)).toBe(480);
    expect(renditionWidth(1000, 563, 360) % 2).toBe(0);
  });

  it('builds a master playlist pointing at each rendition', () => {
    const playlist = buildMasterPlaylist(pickRenditions(720), 1920, 1080);
    expect(playlist.startsWith('#EXTM3U')).toBe(true);
    expect(playlist).toContain('RESOLUTION=1280x720');
    expect(playlist).toContain('360p/index.m3u8');
    expect(playlist).toContain('720p/index.m3u8');
    expect(playlist).not.toContain('1080p');
  });
});
