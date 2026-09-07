# Astra Gallery — Codex Billboards

Interactive museum built with Vinext, React, Three.js and Sites. Source submissions were captured from https://codex-billboard.vercel.app/gallery on 7 September 2026. This is a snapshot, not live voting. Author identities are submitted handles, not verified ownership of the underlying images.

367 submissions were downloaded successfully; image hashes and visual review identified 9 repeated submissions, leaving 358 works. Deduplication retains the highest-voted submission and never combines votes. See dedup-decisions.json and collection-report.json. The Hall of Fame is the ten highest-voted remaining records. Curatorial image descriptions are gallery labels, not original artist titles.

All work images, thumbnails and available creator avatars are bundled locally. Opening a work requests the original source image, with a local 1200px fallback. Tiny source images are retained at their original resolution. Public bios were obtained through FxTwitter's public profile endpoint; unavailable profiles have an explicit fallback. Profiles and vote counts are a dated snapshot.

The Studio uses local browser object URLs and a canvas downscale to a maximum 2048px edge; uploaded content is never transmitted or persisted. It supports PNG, JPG, WebP and AVIF under 25MB. Uploaded works are excluded from public artwork sharing. The Studio can save a screenshot of the billboard in the actual room.

Architecture includes physical room shells, ceiling ribs, skylights, bronze trims, repeated connected chambers, limestone PBR maps, per-work track fixtures, eight nearby spotlights, image-focused illumination and shadows. Furniture and the bronze orbital sculpture were modeled in Blender. Rooms share an entrance promenade. Walking collision covers perimeter walls, entrances, chamber walls, benches and sculptures. Textures load near the visitor and unload at distance.

The collection dialog is an accessible alternative to 3D navigation. Artwork links use ?art=<id> and can be shared with the system share sheet or clipboard. Keyboard: WASD movement; arrows forward/back/turn; Shift speed; drag mouse or swipe to look; touch direction pad on small screens.

A 65-second original cinematic score accompanies both the interactive guided tour and the downloadable film. See soundtrack.md for production and source notes.

Optional WebMCP tools: explore_astra_room and open_astra_artwork. Browser registration is feature-detected; no supported validation context was available during this build, so the WebMCP contract has not been runtime-verified.

Validation: the production build and TypeScript checks passed. Gallery-specific lint passed. scripts/verify-gallery.mjs checks all catalog assets and the ranking, raycasting against opaque walls, the inert studio placeholder, and safe walking recovery at 260 points on the tour. The unmodified starter component catalog has pre-existing lint violations; those files were not changed. Browser UI testing was not requested. Film frames were rendered and inspected as part of video production, and the final MP4 was decoded and verified.

The editable Remotion film sources are preserved in production/film-source.tar.gz. To reproduce, unpack them into a separate folder, copy this project's public assets into its public directory, and generate the WAV score with the source in production/audio before following documentation/film.md. Blender geometry generation source is in production/blender.
