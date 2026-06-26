# WODch

A gym training web app combining a full-featured interval timer, a workout editor, and a YouTube/Instagram video player in a fully resizable layout.

## Features

### Layout
- Two-row resizable layout powered by [splitpanes](https://github.com/antoniandre/splitpanes)
- **Row 1 (15%)** — Timer bar: round count + current time, horizontally centered. Gear icon opens settings.
- **Row 2 (85%)** — Side-by-side resizable panes: workout editor (left) and video player (right)
- All dividers are drag-resizable

### Timer — 10 Modes
Replicates the Rogue Fitness Echo Gym Timer 2.0 feature set:

| Mode | Description |
|---|---|
| Clock | System time, 12h or 24h |
| Stopwatch | Count up from 0, centisecond precision |
| Count-Down | Countdown from a configurable target |
| Count-Up | Count up from a configurable start time |
| Tabata | 20s work / 10s rest × 8 rounds |
| Fight Gone Bad 1 | 5 × (5 min work + 1 min rest) |
| Fight Gone Bad 2 | 3 × (5 min work + 1 min rest) |
| EMOM | Configurable interval × configurable rounds |
| Custom Intervals | Up to 10 named programs (rounds, work duration, rest duration) |
| Warmup | Optional countdown before the main interval starts |

Custom interval programs are saved to `localStorage` and persist across sessions.

### Timer Controls
- **Click timer bar** — Start/pause when running or paused; open settings when idle
- **Gear icon** — Open settings modal at any time
- **Keyboard shortcuts** (blocked when focus is in an input field):
  - `Space` — Start / pause
  - `R` — Reset
  - `M` — Open / close settings modal

### Workout Editor
- Full-height `<textarea>` with dark theme (black background, white monospace text)
- No saving — clears on reload, by design

### Video Player
- Paste a YouTube or Instagram URL into the input bar to embed the video
- Supported URL formats:

| Input | Embedded as |
|---|---|
| `youtube.com/watch?v=XYZ` | `youtube.com/embed/XYZ` |
| `youtu.be/XYZ` | `youtube.com/embed/XYZ` |
| `instagram.com/reel/XYZ/` | `instagram.com/p/XYZ/embed/` |

## Tech Stack

| Technology | Purpose |
|---|---|
| [Vue 3](https://vuejs.org/) | UI framework |
| [Vite](https://vitejs.dev/) | Build tool |
| [TypeScript](https://www.typescriptlang.org/) | Type safety |
| [Pinia](https://pinia.vuejs.org/) | Timer state management |
| [splitpanes](https://github.com/antoniandre/splitpanes) | Resizable panel layout |
| [Vitest](https://vitest.dev/) | Unit testing |
| [jsdom](https://github.com/jsdom/jsdom) | DOM environment for tests |

## Development

```bash
npm install
npm run dev        # Dev server on http://localhost:5173
npm test           # Run unit tests (31 tests)
npm run test:watch # Watch mode
npm run build      # Type-check + production build
```

## Deployment

### Docker

The app is served as a static Vite build inside an Nginx container. Multi-stage build:

```
Stage 1 (node:22-alpine)   npm ci && npm run build → dist/
Stage 2 (nginx:alpine)     serve dist/ on port 80
```

Build and run locally:

```bash
docker build -t wodch:local .
docker run -p 8080:80 wodch:local
# App available at http://localhost:8080
```

### GitHub Actions

Workflow file: `.github/workflows/docker.yml`

The pipeline runs on every push to `main` and on version tags (`v*`):

1. **Test job** — `npm ci` + `npm test` (must pass before the image is built)
2. **Build & push job** — multi-arch image (`linux/amd64` + `linux/arm64`) pushed to GitHub Container Registry

| Trigger | Image tag |
|---|---|
| Push to `main` | `latest` |
| Push tag `v1.2.3` | `1.2.3` |

Registry: `ghcr.io/<owner>/wodch`

Authentication uses the built-in `GITHUB_TOKEN` — no external registry account needed.

Pull the latest image:

```bash
docker pull ghcr.io/<owner>/wodch:latest
```
