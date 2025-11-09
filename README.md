# AmAze 2P

Two-player competitive maze racing experience built with Bun, Hono, and PixiJS. Players create or join four-digit lobbies, accept a countdown challenge, and race through procedural mazes toward the single exit. Movement is server-authoritative to keep both clients perfectly in sync.

## Project Layout

```
amaze2p/
├── package.json            # Bun scripts and dependencies
├── tsconfig.json           # Project-wide TypeScript settings
├── .env                    # Runtime configuration (movement speed)
├── server.ts               # Hono server + WebSocket entry point
├── src/
│   ├── types.ts            # Shared packet, lobby, and game types
│   ├── player.ts           # Player identity bookkeeping
│   ├── lobby.ts            # Lobby lifecycle + validation
│   ├── maze.ts             # Recursive backtracking maze generator
│   └── game.ts             # Game state + movement validation
└── public/
    ├── index.html          # UI scaffolding
    ├── styles.css          # Dark themed layout styles
    ├── client.ts           # WebSocket client with reconnect + queuing
    ├── menu.ts             # Main menu interactions
    ├── lobby.ts            # Lobby synchronisation + accept flow
    ├── game.ts             # PixiJS renderer + movement animation
    └── storage.ts          # LocalStorage utility helpers
```

## Prerequisites

- [Bun](https://bun.sh/) ≥ 1.1
- Node-style environment variables (via `.env`)
- Modern browser with WebSocket + `crypto.randomUUID` support

## Getting Started

```bash
cd amaze2p
bun install        # installs dependencies + generates bun.lockb
bun run server.ts  # starts the Hono + WebSocket server on :3000
```

Visit `http://localhost:3000` in two browser tabs to create and join a lobby. The static assets under `public/` are served directly by Hono.

## Configuration

Environment variables live in `.env`:

- `MOVEMENT_SPEED_MS_PER_STEP` – duration (ms) to traverse one maze cell (default `50`)

Restart the server after changing `.env` values.

## Development Notes

- **Maze generation**: recursive backtracking on a `(2n+1)×(2n+1)` grid ensures a perfect maze (one path between any two cells). Start location is the farthest point from the exit computed via BFS.
- **Movement**: clients request direction only; the server computes the full movement to the next junction or wall and relays authoritative updates with animation timing.
- **Reconnection**: the client automatically retries with exponential backoff (1s → 30s). Packets queue while disconnected and flush on reconnect.
- **UI**: PixiJS renders the maze; CSS overlays display countdown + win states. Keyboard arrows drive movement with a 100 ms debounce.

## Scripts

| Script | Description |
| ------ | ----------- |
| `bun run server.ts` | Starts the development server (also used for production) |
| `bun run lint`      | Type-checks the server and client TypeScript |

## Next Steps

- Persist lobbies/games across restarts
- Expand lobby UX (copy code, leave lobby, reconnect messaging)
- Add in-browser diagnostics and richer error handling
