# Astra Gallery — Codex Billboards

Interactive museum built with Vinext, React, Three.js and Sites. Source submissions were captured from https://codex-billboard.vercel.app/gallery on 7 September 2026. This is a dated exhibition snapshot. Author identities are submitted handles; curatorial descriptions are gallery labels.

## Collection

The original Codex Billboards project was created by Jess (@itsjessyin): https://x.com/itsjessyin. It lets people create, share and vote on Codex images. The original gallery is https://codex-billboard.vercel.app/gallery. Astra credits the project and Jess on the entrance view, in Collection, and in the visitor guide, alongside individual artwork attribution.

367 submissions were downloaded. Image hashes and visual review identified 9 repeated submissions, leaving 358 distinct works. Deduplication retains the highest-voted submission without combining votes. See dedup-decisions.json and collection-report.json. The Hall of Fame contains the ten highest-voted remaining records.

Work images, thumbnails and available creator avatars are bundled locally. The full-image overlay requests the original source with a local 1200px fallback. Small source images retain their source resolution. Public bios came from FxTwitter's public profile endpoint; unavailable profiles have a truthful fallback. Sharing uses ?art=<id>, the system share sheet or clipboard.

## Building and navigation

The second building has 26 rooms around an open courtyard and reflecting pool. Forty-five connecting portals form loops with no articulation points or bridges. A street approach leads through the glass-fronted entrance into the Hall of Fame and open studio. The physical room map corresponds to the building.

Six interior treatments vary ceiling height from 4.6 to 7.4 metres, footprints, materials and furniture: a coffered salon, exposed concrete trusses, low walnut slats, vaulted garden rooms, burgundy rooms with oval coves, and cooler ink-coloured rooms. Blender models supply walnut benches, burgundy seating islands, bronze orbital sculptures and leafy trees. Plaster, walnut and terrazzo use tiled normal and roughness maps; coloured paint keeps the rooms distinct under dim illumination. Every artwork has a ceiling-relative fixture and a warm wall wash.

Artwork placement reserves the entire frame-and-caption envelope. Minimum measured clearances: 1.09 m from corners, 0.99 m from door openings, 0.93 m between neighboring envelopes. Geometry checks cover frames, captions, furniture, doorways, corridors and exterior buildings.

Keyboard: WASD movement; arrows forward/back/turn; Shift faster; mouse drag or touch swipe to look. A touch direction pad is available on smaller screens. Room and collection navigation provide direct access to any work. The collection dialog remains available without WebGL.

## Image loading and performance

All 358 low-resolution artwork previews and architecture assets finish loading before the entrance opens. Nearby high-resolution textures fade in over the preview. Distant detail maps can be released while their previews remain. Architecture stays present and uses ordinary frustum culling; rooms are never toggled into view by distance. Static opaque primitives are merged by material within each room, and the spotlight pool fades reassignment during free walking. Three nearby spotlights cast shadows. Performance remains dependent on the visitor's GPU and display resolution; the interactive renderer caps device pixel ratio at 1.5.

## Open studio

Uploads use local browser object URLs and a canvas downscale to a maximum 2048px edge. PNG, JPG, WebP and AVIF under 25 MB are supported. Request-generation checks ensure the latest selection wins. Uploaded content is never transmitted or persisted and is excluded from public artwork sharing. The Studio can save a screenshot of the image hanging in the actual room with adjustable spotlight intensity.

## Film, music and identity

The new 120-second film and interactive guided visit share the same camera route. The first 48 seconds continuously walk from the street into the Hall of Fame and courtyard. Five editorial cuts take the visitor to other wings, with independent gaze, artwork pauses and subtle walking movement. All camera samples are collision-free. The original score is a continuous two-minute arrangement with breathing space between visits and a resolved ending. See film.md, walkthrough.md and soundtrack.md.

The star-and-orbit Astra Gallery identity was generated with built-in imagegen. The selected transparent PNG is public/brand/astra-gallery-logo-v2.png; documentation/logo-v2-prompt.txt preserves the prompt. It appears on the facade and in the interface.

## Verification and reproduction

Production build, TypeScript and gallery-specific lint are checked. The unmodified starter component catalog has pre-existing lint violations. scripts/verify-gallery.mjs checks ranking, all catalog assets, 2,400 safe tour exits, every artwork viewing pad, opaque-wall and glass raycasting, static batching, and the inert Studio placeholder. scripts/verify-layout.mjs flood-fills the physical floor from the street and verifies all room connections and frame clearances. Compact results are in geometry-audit.json and validation-summary.json.

Browser UI testing was not requested. Film stills were rendered and visually inspected as media production; final film encoding and decoding are checked separately. Optional WebMCP explore_astra_room and open_astra_artwork registrations are feature-detected; their browser contract has not been runtime-verified.

The current Remotion sources are preserved in production/film-source-v2.tar.gz. To reproduce, unpack into a separate directory and copy this project's public assets into its public directory. Audio sources are in production/audio-v2; Blender sources are in production/blender-v2. The previous film and audio sources are retained for provenance.
