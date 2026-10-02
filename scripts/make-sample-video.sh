#!/bin/sh
# Makes a 20 second 1080p test video (with audio) so you can try the upload flow without hunting for a file.
# Needs ffmpeg installed locally.
ffmpeg -y -f lavfi -i "testsrc2=duration=20:size=1920x1080:rate=30" \
  -f lavfi -i "sine=frequency=440:duration=20" \
  -c:v libx264 -pix_fmt yuv420p -c:a aac sample-1080p.mp4
echo "Created sample-1080p.mp4"
