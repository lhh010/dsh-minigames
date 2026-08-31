# dsh-minigames

[简体中文](./README.md) | **English**

Floating mini-games window in the DSH Web UI: a slacking-off companion for killing time while waiting for model replies or fixing bugs.

- **Collapsed state**: hiding the window leaves a round floating 🎮 button (bottom-right by default) that you can **freely drag** and whose position is
  remembered — releasing after a drag (> 5px travel) does NOT reopen the window; only a **click** does.
- **Expanded state**: a floating mini-games window — **drag the title bar** to move it anywhere; releasing near a screen edge auto-**snaps** to that edge
  (left/right docking, top/bottom edge-hugging). Position, dock state, and width persist across reloads; default width is min(50vw, 640px), draggable on
  its left edge between 360px–80vw, and you can freely pick a game inside the panel.
- **Games** (all offline, zero asset files, Canvas-rendered):
  1. 🦖 **Dino Run** — the classic Chrome T-Rex (day/night/rain);
  2. 🧱 **Tetris** — classic falling-block line clearing;
  3. 🛡️ **Tank Battle (with AI)** — 2D tank combat, enemy tracking + line-of-sight firing, 3 waves total;
  4. 💎 **Match-3** — click to clear four-connected same-color blocks; pass levels by reaching target scores that increase level by level;
  5. 🔢 **Huarong Pass** — 16-tile number puzzle (15-puzzle); slide tiles into order; the faster you are, the higher the score;
  6. 🐍 **Snake** — classic snake; crossing a boundary makes you emerge from the opposite side (toroidal map);
  7. 🔢 **2048** — slide with arrow keys to merge numbers; merging into 2048 wins;
  8. 💣 **Minesweeper** — left-click to reveal, right-click to flag, double-click a number to auto-expand its surroundings;
  9. 🃏 **Memory Match** — flip two to pair them up; fewer moves mean a higher score;
  10. ⚫ **Gomoku vs AI** — 15×15; the AI both attacks and blocks you;
  11. 🦘 **Hop** — hold to charge, release to jump; the closer your landing, the more points;
  12. 🧱 **Breakout** — move the paddle to bounce the ball; clearing a wall advances to the next level with increasing ball speed;
  13. 🔨 **Whack-a-Mole** — 30-second timed clicking; hit +1, miss −1;
  14. ⚫ **Othello vs AI** — 8×8 Othello; corners matter most; auto-passes when no move is available;
  15. 🐦 **Flappy** — click/space to flap through pipe gaps; the farther, the higher the score;
  16. 🧩 **Sudoku** — 9×9 standard sudoku; D key switches difficulty; filling with no conflicts wins;
  17. 🟡 **Pac-Man** — classic maze munching; power pellets let you eat the ghosts back;
  18. 🎯 **Aim Training** — FPS aim practice: locked mouse turns the view to track a 3D drifting target; left-click shoots with recoil.
- **Reserved extension interface**: a game registry (`registerGame`) — adding a game only requires implementing one interface.
- **Experience details**: games auto-pause when the window is hidden or the tab is switched, and resume when you come back; each game's high score is
  stored in localStorage; keyboard input only takes effect after clicking the game area and never hijacks the chat input box.
- **Responsive sizing**: the game canvas adapts to the panel's **real available space** (toolbar + canvas + control hints always display fully with
  no scrollbars; browser zoom and panel drag-resizing reflow automatically), with width/height caps of 960px.

> **Pick the plugin version that matches your DSH** (a mismatch crashes: common symptom `useConversation is not a function`)
> - DSH **0.1.1-rc.2** (npm latest): install the **old** version `'@dsh-external/dsh-minigames@github:omdsh-dev/dsh-minigames#v0.3.5'`
> - DSH **0.1.2-alpha.1 / alpha.2**: install the **new** version (the default command below)
## Installation

Prerequisites: a built DSH 20260808+ snapshot and `pnpm`.

```sh
# Option 1: pinned-tag git dependency (public mirror, recommended; github:omdsh-dev/dsh-minigames also works)
dsh plugin --profile web add '@dsh-external/dsh-minigames@github:omdsh-dev/dsh-minigames#v0.3.9'

# Option 2: local install
git clone https://github.com/omdsh-dev/dsh-minigames.git
cd dsh-minigames
pnpm install
pnpm build

# Install into the current web profile (writes the dependency and adds it to dsh.profile.bundles)
dsh plugin --profile web add /absolute/path/to/dsh-minigames

# Optional: confirm the composed config lists the plugin once
dsh --profile web --dump-config | grep dsh-minigames
```

> **Install tips**: pnpm 11 may block node-pty build scripts on first install — run `pnpm approve-builds --all` under `~/.dsh/profiles/web` and re-run the install; then **hard-refresh the browser** (Ctrl/Cmd+Shift+R).

### Prompt install (let DSH install it)

Paste this prompt into any DSH session and the agent installs it for you:

> Install the dsh-minigames plugin (DSH floating minigames window plugin):
> 1. Run `dsh plugin --profile web add '@dsh-external/dsh-minigames@github:omdsh-dev/dsh-minigames#v0.3.9'` (the first run may fail because pnpm 11 blocks node-pty build scripts)
> 2. Under `~/.dsh/profiles/web`, run `pnpm approve-builds --all` (approve the build scripts)
> 3. Re-run the install command from step 1
> 4. Remind me to hard-refresh the browser (Ctrl/Cmd+Shift+R)
> On errors, first check the FAQ/known limitations in the README at https://github.com/omdsh-dev/dsh-minigames.
Plugin-set changes take effect after **restarting `dsh web`**. To uninstall:

```sh
dsh plugin --profile web remove @dsh-external/dsh-minigames
```

> This repository ships both `dsh.plugin.json` (registry-channel manifest) and `cordis.patch.yml`
> (official profile bundle channel); install through one of them — never enable both at once.


est includes `@dsh-external/dsh-minigames` and `/plugins/@dsh-external/dsh-minigames/client.js` returns 200 — this plugin is a pure browser bundle (a `document.body` portal) with no host-service or slot dependencies, zero change on 0.1.1-rc.1), while remaining compatible with `@deepseek-ai/dsh@0.0.1-rc.5` (dist-tag `next`, i.e. the npm release of the final snapshot snapshot0812; `npm exec -p @deepseek-ai/dsh@0.0.1-rc.5 -- dsh --profile web --port <port>` accesses the pinned version and starts it in lib production mode), while also staying compatible with `@deepseek-ai/dsh@0.0.1-rc.2` (the npm release of snapshot0811). Tested against the npm rc.5 baseline: after `dsh web` starts, the `window.__DSH_BOOT__` manifest includes `@dsh-external/dsh-minigames`, and `/plugins/@dsh-external/dsh-minigames/client.js` returns 200; typecheck, build, and 201 unit tests pass. Note: starting with 0811 the vendored cordis was renamed to `@deepseek-ai/cordis` (npm releases no longer publish a vendored package under the `cordis` name). This plugin's source imports cordis only as types (`src/index.ts`, `src/client/index.tsx`, `src/invariant.ts`), and the type imports plus peer/devDependencies have been migrated to `@deepseek-ai/cordis` (peer `^4.0.1-rc.1`, which is `4.0.1-rc.4` on the npm rc.5 baseline) — the build output (lib/*.js) has zero cordis runtime imports, a plain `npm install` no longer raises ERESOLVE, and `--legacy-peer-deps` is unnecessary.

### 0811 compatibility notes (snapshot0811, verified on a live instance)

- **Bundle mechanism unchanged**: 0811 still supports the composite bundle-layer mechanism `dsh.bundle.patch` → `cordis.patch.yml` (this plugin's profile bundle install method stays the same); client `dsh.client` metadata discovery and the `window.__ModuleLoader__` loading protocol are both unchanged.
- **cordis rename**: 0811 renamed the vendored cordis from `cordis@4.0.0-rc.7` to `@deepseek-ai/cordis@4.0.1-rc.1`. This plugin imports cordis only as types, and the build output has zero cordis runtime imports — the rename does not affect runtime loading of already-built bundles; on the npm baseline, typecheck of the bare `cordis` import resolving to the public `cordis` package still passes; see the alignment suggestion above.
- **Live-instance boot verification**: after web starts on snapshot0811 (`snapshots/20260811T152241Z`), the `window.__DSH_BOOT__` manifest includes `@dsh-external/dsh-minigames`, `/plugins/@dsh-external/dsh-minigames/client.js` returns 200, and the right-side panel (🎮 mini-games) renders as verified on a live instance. typecheck and 201 unit tests pass against the 0811 baseline.

### 0812/final snapshot compatibility notes (snapshots/20260812T172954Z-final, verified on a live instance)

- **cordis rename in effect**: this plugin has migrated its type-only imports (`src/index.ts`, `src/client/index.tsx`) and `peerDependencies`/`devDependencies` to `@deepseek-ai/cordis` (`^4.0.1-rc.1`; `@deepseek-ai/cordis@4.0.1-rc.4` on the npm rc.5 baseline) — the build output (lib/*.js) has zero cordis runtime imports, typecheck is fully green for npm rc.5 consumers, and `npm install` needs no `--legacy-peer-deps`.
- **Bundle mechanism unchanged**: the final snapshot still supports the composite bundle-layer mechanism `dsh.bundle.patch` → `cordis.patch.yml`; client `dsh.client` metadata discovery and the `window.__ModuleLoader__` loading protocol are unchanged; the panel depends on no host services or layout slots (a pure `document.body` portal), decoupling it from the main framework's version.
- **Live-instance boot verification**: after web starts on the final snapshot (`snapshots/20260812T172954Z-final`), the `window.__DSH_BOOT__` manifest includes `@dsh-external/dsh-minigames` and `/plugins/@dsh-external/dsh-minigames/client.js` returns 200; the boot manifest after starting `dsh web` as an npm rc.5 consumer also includes this plugin. typecheck, build, and 201 unit tests pass against the final-snapshot baseline.

## Changelog

### 2026-08-22 · v0.3.6 — Fix Tetris landed-row not clearing (lock delay)

- **Root cause**: after reaching its final cell the piece did not merge immediately; it waited for the next gravity tick to fail before locking + clearing — up to **800ms** of hover at level 1, during which a completed row looked like it "should clear but didn't". At high levels the opposite applied (120ms), making it impossible to slide pieces into the leftmost column and leaving permanently one-cell-short rows.
- **Fix**: standard **lock delay** — a landed piece stays controllable for 400ms (slide/rotate refreshes the window, max 15 refreshes per piece against infinite stalling), then auto-locks and clears immediately; Space hard drop / Down soft drop at the floor still lock instantly. Added a self-check in `lock()`: any full row surviving a clear logs an error (impossible by construction).
- **Verification**: 2 new unit tests for `isLanded`/`lock` (with conservation assertion); all 203 tests pass; typecheck and build clean.

### 2026-08-20 · v0.3.5 — Declare DSH 0.1.1-rc.1 compatibility (real boot verification)

- **Verification**: real boot verification passed on DSH npm `0.1.1-rc.1` — the boot manifest includes `@dsh-external/dsh-minigames` and client.js returns 200; the plugin is a pure browser bundle (a `document.body` portal) with no host-service or slot dependencies, so all 18 games behave unchanged on 0.1.1-rc.1

### 2026-08-20 · v0.3.4 — Fix inverted Othello HUD disc symbols

- **Fix**: the Othello HUD and end-of-game score used disc symbols counter-intuitively — the filled `●` was paired with the black (player) count and the hollow `○` with the white (AI) count, which read as if the score or winner was computed wrong. Now `○` (hollow) = black (player) and `●` (filled) = white (AI), matching the discs on the board; placement/flip/end-of-game logic is unchanged (verified with 300 simulated random games).

### 2026-08-16 · v0.3.3 — Floating window and draggable 🎮 launcher

- **Floating window**: the collapsed rail is replaced by a round floating 🎮 button; the expanded state is a draggable, edge-snapping
  (left/right docking, top/bottom edge-hugging) floating window with position, dock state, and width persisted
- **Draggable 🎮 button**: dragging (> 5px travel) moves the button and clamps it to the viewport; releasing remembers the position
  (`dsh-minigames:launcher`) without opening the window; a click without travel opens it
- **Resize fix**: dragging the left edge now anchors to the window's actual right edge (the old math assumed the right edge touched the viewport)
- **Accessibility**: the collapsed state is now a native `<button>` instead of `<div role="button">`
- **Verification**: typecheck and 201 unit tests pass; live-loading verification passes

### 2026-08-11 · v0.3.2 — Dino Run character polish

- **🦖 Dino**: redrawn from the classic pixel matrix — big head facing right, upturned tail, streamlined body,
  two running legs (tucked while jumping), white pixel eye; near-black in day, inverted to white at night
- **🐦 Bird**: rounded body + forward-reaching head + pointed beak + flapping wings + tail, dual color palettes
- **🌵 Cactus**: rounded dome + bent arms + vertical rib lines + top highlight; same for the two-cactus variant
- **Verification**: typecheck and 201 unit tests pass; live-loading verification passes

### 2026-08-11 · v0.3.1 — Aim Training becomes FPS-style, plus polish across games

- **🎯 Aim Training FPS-ified**: Pointer Lock mouse capture (cursor hidden), crosshair fixed at screen center,
  mouse-delta view rotation (with pitch; vertical direction fixed), 3D drifting target (lateral movement + height floating),
  **left-click shooting** (recoil kicks the view up then it recovers + random lateral sway that decays + visible bullet tracers and hit sparks),
  first-person rifle viewmodel in the bottom-right, muzzle flash on firing, pause/start overlay hints
- **🔨 Whack-a-Mole**: 3×3 → **5×5** (25 holes), up to **5 moles** up at once
- **🟡 Pac-Man**: mouth complement animation (open/close), ghost walking and eye-turning,
  grid-aligned movement (no more center/wall jitter), snapping back to center on wall hits without getting stuck, opening ghost grace period,
  ghost spawn points moved to both ends of the upper corridor
- **Removed**: 🏓 Pong
- **Verification**: typecheck and 201 unit tests pass; live-loading verification passes

### 2026-08-11 · v0.3.0 — 6 new mini-games (18 total, Pong removed afterwards)

- **New games**: 🔨 Whack-a-Mole (up to 3 up at once), ⚫ Othello vs AI, 🐦 Flappy,
  🧩 Sudoku (three difficulties + timer), 🟡 Pac-Man (dual-ghost AI + power pellets)
- **Removed**: 🏓 Pong (poor gameplay experience)
- **Verification**: typecheck and 189 unit tests pass; live-loading verification passes

### 2026-08-11 · v0.2.0 — 7 new mini-games and detail polish

- **New games** (12 total): 🐍 Snake (toroidal crossing), 🔢 2048, 💣 Minesweeper (double-click expand),
  🃏 Memory Match, ⚫ Gomoku vs AI, 🦘 Hop, 🧱 Breakout
- **Snake**: crossing a boundary continues from the mirrored position on the opposite side instead of dying against a wall
- **Minesweeper**: double-click an already-revealed number; when the flagged count around it equals the number, the remaining unrevealed cells auto-open
- **Verification**: typecheck and 128 unit tests pass; live-loading verification passes

### 2026-08-11 · v0.1.1 — snapshot0810 adaptation and panel responsive-sizing fix

- **Migration**: package.json client metadata migrated from top-level `dshClient` to nested `dsh.client` (inject kept as-is)
- **Fix**: no more vertical scrollbar when the panel's available height is insufficient — `.dmg-body` switched to a flex column layout, the game area gets the real available height, and the canvas adapts as a whole ("toolbar + canvas + control hints") (previously the canvas height was determined by its own content, creating circular measurement; on narrow windows the canvas overflowed and triggered a scrollbar)
- **Bigger**: canvas display width cap 640 → 960, games render larger on big panels
- **Verification**: typecheck and 70 unit tests pass; verified on a live DSH snapshot0810 instance plus multiple viewports (1600×900 / 1536×864 / 1366×640 / 1280×600 / 1024×600 / 960×540 / 1600×500) with no scrollbars

## Gameplay and details

### 🦖 Dino Run

- Space / ↑ / click to jump, ↓ to duck; speed **increases with score** (`320 + score×0.15`) up to a
  760 px/s cap — the longer you run, the faster you go.
- **Score = distance moved ÷ 10**, growing continuously (roughly 50–150 points/second).
- Obstacles: single cacti / double cacti / **three bird types** —
  - High-flying bird: passes over the standing dino's head — punishes random jumping;
  - Low-flying bird: **duck to dodge**, or **jump to the apex** to clear it;
  - Ground-hugging bird: hugs the ground, **only jumping** dodges it (ducking is useless).
- **Denser obstacles later on**: spawn intervals shrink with score (1.1–2.4s → 0.5–1.2s).
- **Day/night switches every 800 points**: day (beige) ↔ night (inverted white).
- **Rain mechanic**: from every 1000 points, a 300-point window (1000–1300, 2000–2300, …) —
  slanting rain + mist that obscures the view, plus **random lightning with full-screen white flashes**.
- Score reporting is throttled to once per 10 points to avoid frequent panel refreshes.

### 🧱 Tetris

- ←→ move, ↑/X rotate (Z counterclockwise), space hard drop, C hold, P pause.
- Standard 10×20 board, 7 tetrominoes (T/S/Z/J/L rotate within a 3×3 matrix without truncation),
  ghost piece, next/hold previews, level acceleration (one level per 10 lines).
- The canvas scales with the panel (devicePixelRatio hi-DPI); when height is insufficient it shrinks to preserve aspect ratio without truncating the top.

### 🛡️ Tank Battle (with AI)

- WASD/arrow keys to move (**free steering** — the hull can turn while hugging walls), space to fire, P pause, R restart.
- The collision box is slightly smaller than one cell (32×32 → 26×26), letting you pass through slightly narrow lanes; hitting a wall snaps
  you back onto the grid lines, and driving straight snaps you to grid boundaries — no getting stuck half-way.
- The scene overlays translucent grid lines so lane directions are obvious at a glance.
- Enemy AI: greedy tracking + line-of-sight shooting; the 2-cell-wide spawn opening doesn't block them; 3 waves total (5 tanks each).
- Explosion effects, spawn-invincibility flashing, track animations, wave/lives HUD.

### 💎 Match-3

- **Click any tile to clear all same-color tiles connected to it in four directions** (diagonals don't count);
- The more you clear at once, the higher the score (quadratic: `score = 10 × cleared²`);
- After clearing, gems above **fall freely** to fill gaps (with fall animations, clear flashes, and floating score text); no new gems are added within a level;
- Reaching the **target score passes the level**, and the target increases by **+400 per level** (800 → 1200 → 1600 → …);
- No same-color group ≥2 and target unmet → game over (R restarts); mouse click and arrow keys + space are supported.
- Supports mouse click/drag and keyboard (arrow keys + space).

### 🔢 Huarong Pass

- 16-tile number puzzle (15-puzzle): a 4×4 board with 15 numbered tiles + 1 empty slot;
- Shuffling is done via random valid slides from the solved state, **guaranteeing every puzzle is solvable**;
- **Click** a tile in the same row/column as the empty slot (multiple tiles can be pushed at once); or slide with **arrow keys** (tiles slide into the empty slot in the arrow's direction);
- Tiles slide with **interpolation animation**, and tiles in their correct positions turn green automatically;
- **Scored by fastest time** (`max(0, 1000 − time×2)`): the shorter the time, the higher the score;
- The HUD shows moves + elapsed time; on completion it shows moves/time; R or a click reshuffles.

### 🐍 Snake

- Arrow keys / WASD to move, R restart, P pause.
- 16×12 grid; eating food grows the snake and scores +1.
- **Toroidal map**: crossing any boundary makes you emerge at the **mirrored position on the opposite side** instead of dying against a wall;
  the only way to die is hitting your own body (the tail cell about to move out doesn't count).
- Filling the entire board wins (`over` is then flagged as a win state).

### 🔢 2048

- Arrow keys / WASD to slide and merge, R restart, P pause; on-screen direction buttons are also supported.
- 4×4 board; when equal numbers slide into each other they merge into double and score points (merge points accumulate into the total);
- After every valid move a new tile spawns at random (90% are 2s, 10% are 4s);
- Merging into **2048 wins** (`won`); when no move or merge direction remains, the game is over;
- Scoring: the values produced by merges accumulate (the merge that creates 2048 alone is +2048).

### 💣 Minesweeper

- **Left-click** to reveal, **right-click** to flag/unflag, **double-click an already-revealed number** to auto-expand, R restart, P pause.
- 9×9 board with 10 mines; **the first click is always safe** (mines are placed outside a 3×3 safe zone);
- A revealed 0 auto-**flood-expands** its surroundings; revealing every safe cell wins (`won`);
- **Double-click expand (chord)**: when the number of flags around a cell equals that number, the remaining unrevealed cells auto-open —
  if a flag was wrong, hitting a mine ends the game and reveals all mines;
- **Timer and fastest time**: timing starts at the first click (shown live in the HUD's top-right) and stops when sweeping finishes;
  **scored by time** (`max(0, 1000 − time×2)`) and reported, with the panel keeping the best score = fastest clear time;
  the faster, the higher the score.

### 🃏 Memory Match

- Click to flip cards, R restart, P pause.
- 4×4 grid with 8 symbol pairs; two matching cards clear, clearing all wins (`finished`);
- Mismatched cards flip back automatically; **fewer moves mean a higher score**
  (`max(0, 500 − moves×5)`).

### ⚫ Gomoku vs AI

- Click to place a stone (black moves first), R restart, P pause.
- 15×15 board; **five in a row (horizontal/vertical/diagonal) wins**; a full board is a draw;
- AI strategy: first **make its own five** → then **block your five** → otherwise pick by the
  "attack ×1.1 + defense" heuristic scoring (only considering spots near existing stones);
- The AI pauses about 0.5s to think, simulating a human rhythm.

### 🦘 Hop

- **Hold to charge** (the power bar rises), **release to jump**, R restart, P pause.
- **High arc**: a noticeably tall jump, with a ground shadow and the block tilting forward mid-air for a strong jump feel.
- Charge determines jump distance and air time; landing on the **next platform** advances +1 point,
  and landing closer to the platform's center earns an extra +2/+1 points;
- Landing back on the current platform costs nothing and play continues; **missing (falling off) ends the game** (with a falling animation);
- **Mixed gap and width distribution**: near gaps (55–105) ≈ 40%, medium (105–140) ≈ 35%,
  far (140–160) ≈ 25%; platform widths **vary** — narrow (42–52) ≈ 30%,
  normal (56–64) ≈ 40%, wide (72–88) ≈ 30%; narrow platforms are harder to land on precisely;
- **Full charge clears the farthest platform** (jump distance ≈ 202), but full charge **overshoots**
  near/medium platforms — you must adjust the charge to the actual gap and width instead of always maxing out.

### 🧱 Breakout

- Mouse / ←→ to move the paddle, R restart, P pause.
- 480×320 viewport: a 5-row × 8-column brick wall; the ball breaks bricks on contact for +10×level points;
- The paddle's bounce angle varies with **where the ball hits** (hitting the edges sends the ball at a steeper angle);
- Clearing a wall advances to the **next level**: the wall rebuilds and ball speed increases (`250 + level×20`);
- 3 lives; losing the ball costs one, and the game ends when they run out.
- **Color mechanic**: each row of bricks has a fixed color (clearing bricks doesn't change it); the ball takes on the color
  of the brick it clears, **clearing same-color bricks scores ×3**, and consecutive same-color clears can chain into high scores.

### 🔨 Whack-a-Mole

- **30-second timer**: click the moles that pop up, R restart, P pause.
- **5×5 grass field** (25 holes), **up to 5 moles up at once**, each retracting after 0.9–1.6s;
- **Hit +1, miss −1** (floor of 0 points); the game ends when time runs out.

### ⚫ Othello vs AI

- Click to place a stone (black moves first), R restart, P pause.
- 8×8 Othello: placing a stone **flips the opponent's stones it sandwiches**; when no move is available you auto-pass,
  and when neither side can move **whoever has more stones wins**;
- Legal spots show hint dots; AI heuristics: **prioritize corners**, avoid corner-adjacent cells, favor edges,
  and also weigh the current flip count and center mobility.

### 🐦 Flappy

- **Click / space / ↑ / W** to flap, R restart, P pause.
- Gravity pulls you down; each pipe pair passed scores +1; speed rises slightly with score;
- Hitting a pipe, the ground, or the ceiling ends the run; the bird has pitch and flapping animations.

### 🧩 Sudoku

- Click to select a cell, **1–9 to fill / 0 or Backspace to clear**, arrow keys move the cursor;
- **D key cycles difficulty** (easy 45 givens / normal 35 / hard 30), R starts a new puzzle;
- Givens are dark and immutable; player entries are blue and **conflicts highlight red**;
- Filling the grid with no conflicts wins; **scored by time** (`max(0, 1000 − time×2)`),
  the faster, the higher the score, and the panel keeps your fastest time.

### 🟡 Pac-Man

- **Arrow keys / WASD** to move (turning only at intersections), R restart, P pause.
- 15×19 maze: dots +10, **power pellets +50 and turn the ghosts blue and edible** (eating a ghost +200);
- Ghosts chase the player (and flee during power); **ghosts have a 1.5s grace period at the start and after respawn**
  during which they don't collide, so no instant death; touching a normal ghost **costs a life**,
  and the game ends when all 3 are gone; eating every dot **clears the level**.

### 🎯 Aim Training

- **Mouse** turns the view (crosshair fixed at screen center), **left-click to shoot**, R restart, P pause.
- **First-person scene**: sky + a perspective ground grid, the horizon moves with pitch, and a held rifle
  viewmodel in the bottom-right;
- The target **drifts in 3D** inside a large world (random lateral direction changes, **vertical height floating**, bouncing off walls),
  projected into the view, shrinking with distance;
- Locking on (crosshair held over the target) scores continuously (10 points/second); **shooting a hit** scores +20,
  **firing has recoil** (the view kicks up then recovers) and **random lateral sway** (quickly decaying),
  and **bullets are visible**: a glowing tracer flies from the muzzle toward the target (hit) or into the distance (miss),
  with an explosion spark at the hit point and a muzzle flash;
- **30-second timer**; at the end it shows the total score and **shot accuracy**.

## Installation

Prerequisites: a built DSH 20260808+ snapshot and `pnpm`.

```sh
# Option 1: pinned-tag git dependency (public mirror, recommended; github:omdsh-dev/dsh-minigames also works)
dsh plugin --profile web add '@dsh-external/dsh-minigames@github:omdsh-dev/dsh-minigames#v0.3.9'

# Option 2: local install
git clone https://github.com/omdsh-dev/dsh-minigames.git
cd dsh-minigames
pnpm install
pnpm build

# Install into the current web profile (writes the dependency and adds it to dsh.profile.bundles)
dsh plugin --profile web add /absolute/path/to/dsh-minigames

# Optional: confirm the composed config lists the plugin once
dsh --profile web --dump-config | grep dsh-minigames
```

> **Install tips**: pnpm 11 may block node-pty build scripts on first install — run `pnpm approve-builds --all` under `~/.dsh/profiles/web` and re-run the install; then **hard-refresh the browser** (Ctrl/Cmd+Shift+R).

### Prompt install (let DSH install it)

Paste this prompt into any DSH session and the agent installs it for you:

> Install the dsh-minigames plugin (DSH floating minigames window plugin):
> 1. Run `dsh plugin --profile web add '@dsh-external/dsh-minigames@github:omdsh-dev/dsh-minigames#v0.3.9'` (the first run may fail because pnpm 11 blocks node-pty build scripts)
> 2. Under `~/.dsh/profiles/web`, run `pnpm approve-builds --all` (approve the build scripts)
> 3. Re-run the install command from step 1
> 4. Remind me to hard-refresh the browser (Ctrl/Cmd+Shift+R)
> On errors, first check the FAQ/known limitations in the README at https://github.com/omdsh-dev/dsh-minigames.
Plugin-set changes take effect after **restarting `dsh web`**. To uninstall:

```sh
dsh plugin --profile web remove @dsh-external/dsh-minigames
```

> This repository ships both `dsh.plugin.json` (registry-channel manifest) and `cordis.patch.yml`
> (official profile bundle channel); install through one of them — never enable both at once.

## Usage

1. Open the DSH Web UI (`dsh web`); a slim 🎮 bar appears at the page's right edge.
2. Click the bar → the panel expands to occupy the right half of the window.
3. Click a game card to start; `P` pauses, `R` restarts (after the round ends), and clicking "Choose Game" returns to the selection list.
4. Click "Collapse" again to fold back into the bar (the game auto-pauses and progress is kept).

## Development

```sh
pnpm install
pnpm run typecheck   # tsc --noEmit
pnpm run test        # vitest 纯逻辑单测（189 个：引擎/棋盘/世界模型/三消/华容道/贪吃蛇/2048/扫雷/翻牌/五子棋/跳一跳/打砖块/打地鼠/黑白棋/Flappy/数独/吃豆人/跟枪/注册表）
pnpm run build       # tsc 声明 + tsdown：lib/index.js（node half）+ lib/client.js（浏览器 bundle）
```

Build artifacts (committed with the source, consistent with dsh-web-panel):

- `lib/index.js` — the node half (loader-line implementation, logging only; client-plugin scanning relies on this line existing).
- `lib/client.js` — the browser bundle, `window.__ModuleLoader__.load({ id:
  '@dsh-external/dsh-minigames', factory })`; the id must match the `name` in `package.json`
  (client-modules use the package name as the compose key).
- `lib/types/` — declaration files.

### Architecture

```
src/
  index.ts            node half（loader 行实现）
  invariant.ts        不变式伴生文件
  client/
    index.tsx         客户端插件：DOM portal 挂载面板（ctx.effect 管理生命周期）
    app.css           面板样式（全部 dmg- 前缀，随 bundle 注入 <style>）
    panel/Panel.tsx   折叠条 / 展开面板 / 游戏选择器 / GameArea 生命周期
    games/
      types.ts        游戏扩展接口（MiniGameDefinition / MiniGameInstance）
      registry.ts     注册表（registerGame / getGames / getGame）
      focus.ts        键盘焦点门控（避免劫持聊天输入）
      canvas-fit.ts   画布按宿主自适应缩放（devicePixelRatio，防截断）
      index.ts        内置游戏注册点
      dino/    纯逻辑（引擎：物理/计分/昼夜/雨天/生成密度）+ 渲染 + 游戏定义
      tetris/  纯逻辑（棋盘：旋转/消行/暂存/等级）+ 渲染 + 游戏定义
      tanks/   纯逻辑（世界：网格/转向吸附/AI/波次/特效）+ 渲染 + 游戏定义
      match3/  纯逻辑（三消：四连通/落体/目标分/关卡）+ 渲染 + 游戏定义
      huarong/ 纯逻辑（华容道：滑动/打乱/解状态）+ 渲染 + 游戏定义
      snake/   纯逻辑（贪吃蛇：环面穿越/自撞/成长）+ 渲染 + 游戏定义
      game2048/ 纯逻辑（2048：滑动合并/生成/胜负判定）+ 渲染 + 游戏定义
      minesweeper/ 纯逻辑（扫雷：布雷/洪水展开/标旗/双击展开）+ 渲染 + 游戏定义
      memory/  纯逻辑（翻牌：配对/步数）+ 渲染 + 游戏定义
      gomoku/  纯逻辑（五子棋：落子/胜负/启发式 AI）+ 渲染 + 游戏定义
      hop/     纯逻辑（跳一跳：蓄力/落地判定/计分）+ 渲染 + 游戏定义
      breakout/ 纯逻辑（打砖块：挡板/碰撞/关卡/球速）+ 渲染 + 游戏定义
      whack/   纯逻辑（打地鼠：计时/冒头/得分）+ 渲染 + 游戏定义
      othello/ 纯逻辑（黑白棋：翻转/让位/终局/启发式 AI）+ 渲染 + 游戏定义
      flappy/  纯逻辑（Flappy：重力/柱子/碰撞/计分）+ 渲染 + 游戏定义
      sudoku/  纯逻辑（数独：生成/挖洞/冲突/计时）+ 渲染 + 游戏定义
      pacman/  纯逻辑（吃豆人：迷宫/移动/幽灵 AI/力量豆）+ 渲染 + 游戏定义
      aimtrack/ 纯逻辑（跟枪：视角转向/三维漂移/射击后坐/晃动/命中率）+ 渲染 + 游戏定义
tests/               纯逻辑单元测试
```

The panel depends on no host services or layout slots (a pure `document.body` portal), so:
- it is decoupled from the main framework's version, `dsh.client.inject` is empty, and the client has zero `@deepseek-ai` dependencies;
- no matter how the DSH layout changes (left column / right column / collapsed), there is no conflict.

## Adding a New Game (Reserved Interface)

Implement `MiniGameDefinition` (`src/client/games/types.ts`):

```ts
import { registerGame, type MiniGameDefinition } from './index.ts'

const myGame: MiniGameDefinition = {
  id: 'my-game',            // 唯一 id（作为选中记忆与最高分 key）
  title: '我的游戏',
  icon: '🎯',
  description: '一句话介绍',
  controls: ['空格：跳跃', 'P：暂停'],   // 画布下方的按键图例
  create(host, options) {
    // 在 host 内创建 <canvas>；返回实例：
    return {
      start() {},    // 启动/恢复主循环
      pause() {},    // 暂停（面板折叠/切标签页/用户暂停时调用）
      resume() {},   // 恢复
      destroy() {},  // 释放 rAF/键盘监听等
    }
  },
}

registerGame(myGame)
```

The instance returned by `create` has its lifecycle driven by the panel: when switching games, the old instance is `destroy()`ed first, then
the new one is `create()`d; `pause()` is called when the panel collapses, the tab hides, or the user pauses.
Scores are reported via `options.onScore?.(score)` (called only when they change); the panel handles display and
high-score persistence. It's recommended to split game logic into pure-function modules (no DOM/timers), covered
by unit tests just like the existing games.

## Known Limitations and Roadmap

- Keyboard control depends on the game area's focus; after clicking the chat input you must click back into the game area to keep playing (intentional).
- Tank Battle's AI uses greedy tracking + line-of-sight shooting with no pathfinding; obstacle avoidance and different armor types could be added later.
- Match-3's and the block/tank games' level progress is not saved across sessions (only high scores persist).
- Dino's rain and day/night are purely visual atmosphere and don't affect gameplay logic.
