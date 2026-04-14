# Star Duel

Browser-first Phaser tactical duel with two play modes:

- `Local Hot-Seat`: two players share one keyboard on one machine
- `Online`: each player uses their own browser while a local Colyseus server owns the match state

This branch, `desktop-phaser-colyseus`, is the active desktop/network line. It preserves the lightweight browser-first direction while adding an authoritative online server and temporary public hosting through Cloudflare Quick Tunnel.

## What This Branch Includes

- Phaser 3 client rendered in the browser
- Vite development workflow
- Shared game rules engine separated from the renderer
- Colyseus authoritative room server for online play
- Cloudflare Quick Tunnel host flow for temporary public invites
- Managed start/stop/cleanup scripts for Linux, macOS, and Windows
- Browser and Colyseus smoke tests

## Requirements

- `Node.js >= 20.19.0`
- `npm`
- a modern Chromium-based browser for the current smoke automation
- internet access if you want to test `Host Online` through Cloudflare Quick Tunnel

## Branch Guide

- `desktop-phaser-colyseus`
  Active browser-first branch for ongoing networked desktop work
- `desktop-phaser`
  Standalone Phaser line before Colyseus integration
- `main`
  Original static HTML/CSS/JS prototype
- `baseline`
  Stable snapshot of the original prototype before the Phaser rewrite

Typical collaborator setup:

```bash
git clone <repo-url>
cd star-duel
git switch desktop-phaser-colyseus
```

## Install

```bash
npm install
```

## Quick Start

Preferred daily workflow: use the managed scripts. They start and stop the full local stack needed for both local play and online testing.

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

Then open:

```text
http://127.0.0.1:4173/
```

## Managed Stack

The managed stack starts:

- Vite client at `http://127.0.0.1:4173/`
- Colyseus room server at `http://127.0.0.1:2567/`

When online hosting is used, the local Colyseus server can also launch:

- Cloudflare Quick Tunnel for the browser app
- Cloudflare Quick Tunnel for the Colyseus server

### Stop The Stack

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

### Aggressive Cleanup

Use cleanup if an experiment stranded ports, sockets, or helper processes.

Linux:

```bash
./scripts/cleanup-linux.sh
```

macOS:

```bash
./scripts/cleanup-macos.sh
```

Windows PowerShell:

```powershell
.\scripts\cleanup-windows.ps1
```

Windows Command Prompt:

```bat
scripts\cleanup-windows.cmd
```

### Status

```bash
npm run status:dev
```

This reports:

- Vite dev server state
- Colyseus server state
- Cloudflare app tunnel state
- Cloudflare server tunnel state

The managed stop and cleanup paths both tear down tracked Cloudflare tunnels as well as the local servers.

## Direct Commands

You can still run pieces manually when needed:

```bash
npm run dev
npm run server
npm run build
npm run preview
```

## Game Modes

### Local Hot-Seat

- starts immediately from the landing screen
- two players share one keyboard
- both HUDs remain visible
- turn handoff is done on the same machine

### Host Online

- click `Host Online`
- click `Host Match`
- Star Duel asks the local Colyseus server to create temporary Cloudflare Quick Tunnel URLs
- when tunnel creation succeeds, the host enters the online battle view immediately
- the invite link is copied automatically when clipboard access is available

The invite link includes:

- the public browser URL
- the room code
- the public server URL needed by the joining browser

### Join Online

- click `Join Online`
- paste the invite link from the host
- click `Join Match`

Fallback path:

- open `Manual Room Entry`
- enter room code and server URL manually

## Online Behavior

Online mode is intentionally different from local hot-seat:

- each player gets a single-player HUD
- player 2 sees the board from the opposite perspective
- the Colyseus room server is authoritative
- random outcomes are resolved on the server
- out-of-turn or illegal commands are rejected by the server

For friend testing, the intended path is `Host Online` with Cloudflare Quick Tunnel. That avoids manual public-IP lookup and avoids router port forwarding for this temporary hosting path.

## Current MVP Rules

- 33 x 33 hex battlefield
- asteroid obstacles are randomized each battle from a wider debris pool
- asteroids block movement
- asteroids also block torpedo lines of fire
- crystal powerups are randomized each battle from scattered board positions
- each crystal grants 1 boosted torpedo shot at `+50%` damage
- randomized first player
- 2 actions per turn
- free left/right ship rotation
- move action allows up to 3 forward thrusts
- shield toggle costs 1 action
- torpedoes require shields to be down
- each ship starts with `100` hull, `100` shield pool, and `10` torpedoes
- torpedoes deal `35` base damage
- torpedo hit chance is `95%` at 1 hex and drops by `5%` per additional hex
- if both ships run out of torpedoes, the ship with more remaining hull wins

## Controls

- `Left` and `Right`: rotate the active ship
- `M`: begin move action
- `Up`: move one hex forward during movement
- `Down`: finish movement
- `S`: raise or lower shields
- `F`: fire torpedoes
- `E`: end turn early
- `R`: reset battle

## Audio Notes

- existing alert/explosion sounds were rebalanced downward
- `code red` playback is shortened without intentionally shifting pitch
- `torpedo_away.mp3` plays on torpedo launch at a shortened duration

## Project Structure

- `src/game/star-duel-engine.js`
  Shared gameplay engine: state, board generation, combat resolution, turn flow, gameplay events
- `src/game/star-duel-app.js`
  Phaser-facing app layer: rendering, input, HUD, audio, UI flow
- `src/game/star-duel-protocol.js`
  Shared command and message contract for local and online paths
- `src/network/star-duel-online-client.js`
  Browser-side Colyseus wrapper
- `src/network/local-hosting-client.js`
  Browser-side calls into the local hosting admin API
- `server/star-duel-room.js`
  Authoritative Colyseus room
- `server/index.mjs`
  Colyseus server bootstrap and local hosting admin API
- `server/quick-tunnel-manager.mjs`
  Cloudflare Quick Tunnel lifecycle manager
- `scripts/dev-server.mjs`
  Managed lifecycle for local services and tracked helper processes

## Testing

Build:

```bash
npm run build
```

Browser smoke against a running managed stack:

```bash
npm run smoke
```

Colyseus smoke:

```bash
npm run smoke:colyseus
```

### Manual Local Test

1. Start the managed stack.
2. Open `http://127.0.0.1:4173/`.
3. Choose `Local Hot-Seat`.
4. Verify movement, shields, torpedoes, asteroids, powerups, and reset flow.

### Manual Online Test On One Machine

1. Start the managed stack.
2. Open browser window A to `http://127.0.0.1:4173/`.
3. Choose `Host Online`.
4. Click `Host Match`.
5. Wait for the host battle view.
6. Copy the invite.
7. Open a second browser window or incognito session.
8. Paste the invite link.
9. Choose `Join Match`.

Expected:

- both browsers sync to the same match
- each browser sees only its own HUD
- player 2 sees the flipped board
- out-of-turn actions are rejected

### Manual Online Test With A Friend

1. Start the managed stack on the host machine.
2. Host an online match.
3. Send the invite link to the remote player.
4. The remote player opens the link and joins from their browser.

## Troubleshooting

### Cloudflare Invite Link Opens But Vite Rejects The Host

This branch includes a Vite config that allows `*.trycloudflare.com` hosts. If you still see a host-blocked error, restart the managed stack so the updated Vite config is active.

### Cloudflare Hosting Stalls

Check:

- outbound internet access on the host machine
- `.run/cloudflare-client-tunnel.log`
- `.run/cloudflare-server-tunnel.log`

Quick status check:

```bash
curl -sf http://127.0.0.1:2567/api/hosting/status
```

Expected:

- `"available": true`

### Ports Feel Stuck

Use:

```bash
npm run cleanup:dev
```

or the platform-specific cleanup wrapper. That is the intended recovery path instead of manually killing ports with `fuser`, `lsof`, or `taskkill`.

### Cloudflare Quick Tunnel Is Not Meant To Be Permanent Infrastructure

This host flow is designed for lightweight testing and ad hoc sharing. It is intentionally temporary. If the project eventually needs a stable public deployment, that should become a separate hosting track.
