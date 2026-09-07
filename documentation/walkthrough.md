# Astra Gallery 120-second walkthrough

Integrate `tour.ts` into `lib/gallery/tour.ts`. It uses only relative `./layout` and `./data` imports. Its required exports are `TOUR_DURATION = 120` and `tourPose(seconds)`.

The returned pose includes position, target, themed room index, chamber ID, room name, shot progress, section index and bounds, a short cut cue, and moving state. Camera position and gaze are independent. Rounded path geometry is sampled by arc length; cosine acceleration occurs only when starting or ending intentional movements. Gaze orientation interpolates smoothly without target-crossing spins. Head bob is at most 0.01 m and stops during holds.

Use a change in `sectionIndex` to detect an editorial cut robustly, including when seeking. The `cut` property is only true during the first 1/30 second of a new section.

## Timeline

- 0–48 s: uninterrupted street arrival, entrance passage, two Hall of Fame inspections, then courtyard reveal.
- 48–70 s: one connected walk from the blue street image in Urban Canvas through the real shared doorway to Less, but Louder.
- 70–84 s: approach an Alpine scene and turn toward the desert photograph.
- 84–97 s: a colorful loop, followed by an angled walk toward the iridescent illustration.
- 97–110 s: cafe and builder portraits in Human / Machine.
- 110–120 s: studio approach and a held view of the custom billboard.

Five cuts occur at 48, 70, 84, 97, and 110 seconds. The studio point matches `placeWork(..., studio, 'south', -4.75)`, with final viewing position (9.25, 1.78, -8.23).

## Compact auditable checks

Preserve `geometry-audit.mjs`, `geometry-audit.json`, and `validation-summary.json`; no large layout snapshot is needed. Run the geometry audit with Node and a project directory: `node geometry-audit.mjs /path/to/AstraGallery`. It bundles current layout data locally, checks all placements and portal connections, flood-fills the physical floor from the street, and exits nonzero for any failed invariant.

`validation-summary.json` records 14,401 camera samples at 120 Hz, with a layout and tour source SHA-256. `tour.ts` also exports `validateTourRoute(step)` to rerun collision sampling after layout edits.

The checks include the final tree, bench, neighboring building, column, bollard, and courtyard lamp colliders. The temporary 51 MB repeated-data snapshot was removed.
