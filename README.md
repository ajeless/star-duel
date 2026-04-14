# Star Duel

Browser-first Phaser prototype for a hot-seat, turn-based, two-player ship duel inspired by Sega's 1983 Star Trek: Strategic Operations Simulator.

## Stack

- `Phaser 3`
- `Vite`
- plain JavaScript

## Run

Install dependencies:

```bash
npm install
```

Start the development server directly:

```bash
npm run dev
```

Start the managed development server:

Linux:

```bash
./scripts/start-linux.sh
```

macOS:

```bash
./scripts/start-macos.sh
```

Windows PowerShell:

```powershell
.\scripts\start-windows.ps1
```

Windows Command Prompt:

```bat
scripts\start-windows.cmd
```

Stop the managed development server:

Linux:

```bash
./scripts/stop-linux.sh
```

macOS:

```bash
./scripts/stop-macos.sh
```

Windows PowerShell:

```powershell
.\scripts\stop-windows.ps1
```

Windows Command Prompt:

```bat
scripts\stop-windows.cmd
```

The managed scripts start and stop the Vite dev server on `http://127.0.0.1:4173/`, keep a local run log in `.run/vite-dev-server.log`, and clean up the tracked server process on shutdown.

Check managed server status:

```bash
npm run status:dev
```

Create a production build:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

Run the browser smoke check against a running managed dev server:

```bash
npm run smoke
```

## Branch Workflow

- `desktop-phaser` is the active browser-first branch for ongoing desktop work.
- `main` preserves the original static HTML/CSS/JS prototype.
- `baseline` preserves the same original prototype as a stable pre-rewrite snapshot.
- Collaborators targeting the lightweight Phaser path should start from `desktop-phaser`.
- Collaborators who need the original prototype should use `main` or `baseline`.

Example:

```bash
git clone <repo-url>
cd star-duel
git switch desktop-phaser
```

## Current MVP Rules

- 33 x 33 hex battlefield
- Asteroid obstacles are randomized each battle from a wider board-spanning debris field
- Asteroids block both movement and torpedo lines of fire
- Crystal powerups are randomized each battle from scattered board positions
- Each crystal currently grants 1 boosted torpedo shot at +50% damage
- Randomized first player
- Up to 2 actions per turn
- Ships start facing each other with shields lowered
- Move action allows up to 3 forward thrusts
- Shield toggle costs 1 action
- Torpedoes require shields to be down
- Each ship starts with 100 hull, 100 shield pool, and 10 torpedoes
- Torpedoes deal 35 damage
- Torpedo hit chance is 95% at 1 hex and drops by 5% per additional hex
- If both ships run out of torpedoes, higher remaining hull wins

## Controls

- `Left` and `Right` rotate the active ship freely
- `M` enter move mode
- `Up` move one hex forward during a move action
- `Down` finish a move action
- `S` raise or lower shields
- `F` fire torpedoes
- `E` end turn early
- `R` reset the battle
