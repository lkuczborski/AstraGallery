# README gallery images

These JPEGs are frames from `public/media/astra-gallery-film.mp4`, the shipped 120-second walkthrough. They were extracted specifically for the repository README and resized to 1280 × 720, without compositing or retouching.

| File | Film timestamp |
| --- | --- |
| `hall-of-fame.jpg` | 00:16 |
| `courtyard.jpg` | 00:44 |
| `chromatic-worlds.jpg` | 01:29 |

Example reproduction from the repository root:

```sh
ffmpeg -hide_banner -loglevel error -ss 16 -i public/media/astra-gallery-film.mp4 -frames:v 1 -vf scale=1280:-1 -q:v 3 documentation/images/hall-of-fame.jpg
```
