# Star Duel

Browser prototype for a hot-seat, turn-based, two-player ship duel inspired by Sega's 1983 Star Trek: Strategic Operations Simulator.

## Run

Open [index.html](./index.html) directly in a browser.

If you prefer a local server:

```bash
python3 -m http.server
```

Then open `http://localhost:8000`.

## Current MVP Rules

- 33 x 33 hex battlefield
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
