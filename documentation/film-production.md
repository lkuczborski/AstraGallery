# Production handoff: Astra Gallery — Rooms of Light v2

Final media: `astra-gallery-rooms-of-light-v2.mp4`

- MIME type: `video/mp4`
- H264 video, stereo AAC audio, MP4 faststart
- Exactly 120.000 seconds, 1920 × 1080, 24 fps, 2,880 frames
- 21,628,190 bytes (20.6 MiB), below 25 MiB
- SHA-256: `fb0cbc287bb23cb4326b885ab12c825c4c24a1580634a6c8560360c596bde897`

The source archive intentionally excludes `node_modules`, `public`, and `out`. Install pinned dependencies with `npm ci`. Supply the gallery's static `public` assets, including the original score at `public/media/astra-rooms-of-light-120s.wav`, then follow the render and final-mux commands in `README.md`.

The exact rendering source is under `src/gallery`; it includes the frozen batched GalleryWorld, layout/catalog, and authored 120-second tour. The only world adapter changes concern deterministic texture retention/promotion during instant film updates. The final output uses the original route; the optional architecture-inspection pose does not appear in the film.

`diagnostics/` preserves baseline and final renderer metrics, the 120 Hz collision-free route validation, final media metadata, and source/media hashes. The original full rendering workspace remains at `/private/tmp/astra-film-v2`. No preview server is running.
