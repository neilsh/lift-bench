# LiftBench

An interactive, deterministic twin-tower elevator dispatch simulator and benchmark.

## Why This Exists

LiftBench started from a hallway conversation with a colleague: **is a destination dispatch system (where you punch your floor into a lobby kiosk and get assigned a specific car) actually more efficient than a normal elevator, or does it just feel more organized?**

Instead of guessing, I vibe-coded a side-by-side simulation where two identical towers receive the exact same seeded stream of passenger arrivals in real time—letting you pit traditional **Collective SCAN** against **Destination Dispatch** (and four other scheduling strategies) and watch queues, stops per trip, energy draw, and time-to-destination diverge live.

## Features

- **Synchronized Two-Tower Benchmark** — Both towers share identical building parameters and deterministic seeded passenger arrivals (`50 ms` fixed-timestep physics) for an apples-to-apples comparison.
- **6 Dispatch Algorithms** — Swap either tower's controller at any time and compare any pair head-to-head.
- **5 Traffic Scenarios** — Switch between realistic commercial office traffic profiles or inject `+12 Burst` surges and click any floor on the canvas to spawn passengers on demand.
- **Live Visual Canvas & Thermal Overlay** — Color-coded passenger destinations, real-time shaft motion, hover inspection on cars and floors, and a toggleable floor wait-time heatmap (`0s` emerald to `45s+` crimson).
- **Phase I Fire Alarm Recall** — Trigger emergency recall to send every car nonstop to the lobby, evacuate onboard riders, and lock shafts out of service.
- **CIBSE Guide D Telemetry & Export** — Open the Metrics modal for live AWT, ATT, ATTD, `p25`–`p95` distributions, observed RTT, 5-minute handling capacity (`%POP`), lobby interval, `Wh/pax` energy estimates, time-series trends, and one-click CSV/JSON export.

## Dispatch Algorithms

| Algorithm                | Short Name | How It Works                                                                                                                                         |
| ------------------------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Collective SCAN**      | `SCAN`     | Classic directional sweep; cars collect matching-direction hall calls en route until no calls remain ahead, then reverse.                            |
| **Destination Dispatch** | `Dest. DD` | Riders enter destinations in the lobby; a wave-aware stop-delay cost function clusters passengers bound for nearby floors to cut intermediate stops. |
| **Nearest Car (ETA)**    | `Nearest`  | Assigns each hall call to the single lowest-ETA car based on direction, pending stops, and load.                                                     |
| **Static Zoning**        | `Zoning`   | Partitions upper floors into contiguous exclusive bands (one per shaft) for natural express runs.                                                    |
| **Eco Batching**         | `Eco DD`   | Destination dispatch variant that parks idle cars in place and briefly holds lobby cars to consolidate fuller, lower-energy batches.                 |
| **FIFO Baseline**        | `FIFO`     | Serves passengers in strict arrival order without intermediate pickups—a naive baseline for measuring scheduling gains.                              |

## Traffic Presets

- **Morning Rush** — `82%` Up / `10%` Down / `8%` Inter-floor
- **Lunch Crunch** — `42%` Up / `42%` Down / `16%` Inter-floor (heavy cafeteria hotspot)
- **5 PM Exodus** — `84%` Down to Lobby / `10%` Up / `6%` Inter-floor
- **Sky Bar / VIP** — Heavy top-floor express and penthouse shuttle demand
- **Uniform Up-Peak** — `100%` Up from Lobby with equal floor weights

## Getting Started

### Prerequisites

- Node.js 20+ (or Bun)

### Run Locally

```bash
npm install
npm run dev
```

The app runs at `http://localhost:3000`.

```bash
VITE_GITHUB_REPO_URL="https://github.com/neilsh/lift-bench"
```

### Scripts

```bash
npm run dev            # Start Vite dev server on port 3000
npm run build          # Production build to dist/
npm run preview        # Preview production build
npm run test           # Run Vitest unit & component tests
npm run test:coverage  # Run tests with V8 coverage report
npm run lint           # Run oxlint + TypeScript typecheck
npm run format         # Format codebase with oxfmt
npm run check          # Run format check, lint, coverage tests, and build
```

## Tech Stack

- **UI & Rendering:** React 19, TypeScript, Tailwind CSS v4, HTML5 Canvas, Lucide icons
- **Build & Quality:** Vite 8, Vitest, Testing Library, Oxlint, Oxfmt

## Built With

Made in the Gemini app and Google AI Studio—mostly using **Gemini 4 Neon** for planning and **Gemini 4 Hydrogen** for implementation.

## License

[MIT](./LICENSE)
