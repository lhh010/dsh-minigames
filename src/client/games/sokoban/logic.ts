/**
 * 推箱子 (Sokoban) pure logic: grid parsing/validation, player moves with
 * single-box pushes, undo with full state restore, clear detection, and
 * reached-level progress helpers (clamp/unlock rules plus a
 * localStorage-or-session store). Deterministic functions over a plain
 * state object; no DOM. The game
 * instance in index.ts drives rendering and level flow, and the unit tests
 * drive the logic directly (including a BFS solvability check over the
 * built-in levels).
 */

export interface Position { r: number; c: number }

/** A parsed level: static geometry plus the initial box/player layout. */
export interface SokobanLevel {
  rows: number
  cols: number
  /** true = wall. */
  walls: boolean[][]
  /** true = goal cell. */
  goals: boolean[][]
  /** true = box (initial layout). */
  boxes: boolean[][]
  player: Position
}

/** One applied move, kept for undo and animation. */
export interface SokobanMove {
  playerFrom: Position
  playerTo: Position
  boxFrom: Position | null
  boxTo: Position | null
  /** A box landed on a goal this move (+100). */
  scored: boolean
  /** This push cleared the level (+500). */
  cleared: boolean
}

export interface SokobanState {
  levelIndex: number
  rows: number
  cols: number
  walls: boolean[][]
  goals: boolean[][]
  boxes: boolean[][]
  player: Position
  moves: number
  score: number
  /** Score when the current level started; restart rolls back to it. */
  entryScore: number
  history: SokobanMove[]
  cleared: boolean
}

/** Score awarded when a box lands on a goal. */
export const BOX_SCORE = 100
/** Score awarded when the level is cleared. */
export const CLEAR_SCORE = 500

/**
 * The 45 built-in levels, microban-style, ≤ 14x14, ordered by difficulty.
 * Levels 11-20 ramp through narrow corridors and goal rooms with forced
 * fill ordering (deepest goal first), up to 6 boxes; level 20 funnels six
 * boxes down a deep two-cell shaft into a wide goal row. Levels 21-30 are
 * the hard tier (6-8 boxes): goal-column parking order, left-edge shaft
 * rides, dual shafts into offset goal rows, split goal pockets, deep shafts
 * with a blocking box, side-chamber shuttles, a single-doorway two-room
 * shuttle, and a toothed divider column for the finale. Levels 31-45 are
 * the expert tier (6-7 boxes): side chambers that must clear before the
 * shaft, single-doorway three-room chains, goal rooms fed by one shared
 * shaft with a blocking box parked in the drop zone, and shafts of varying
 * depth whose blocker position forces strict push ordering. Every expert
 * level measures 97k-278k node expansions on the budgeted solver in the
 * unit tests (hard tier tops out near 290k on level 30).
 * Tiles: # wall, space floor, $ box, . goal, * box-on-goal, @ player,
 * + player-on-goal.
 */
export const LEVELS: string[] = [
  `
#####
#@$.#
#####
`,
  `
#######
#@  $.#
#######
`,
  `
#####
#@  #
# $ #
# . #
#####
`,
  `
######
#    #
# $$ #
# .. #
# @  #
######
`,
  `
######
#    #
# #@ #
# $* #
# .* #
#    #
######
`,
  `
#######
#     #
# .$. #
# $@$ #
#  $. #
#   . #
#######
`,
  `
#######
#     #
# # # #
# $ . #
# #@  #
# $ . #
#######
`,
  `
########
#      #
# .**$@#
#      #
#####  #
    ####
`,
  `
########
#      #
# $  . #
# @    #
# $  . #
#      #
########
`,
  `
#########
#       #
#  $ $  #
#  ###  #
# $  @  #
#  ...  #
#########
`,
  `
###########
#..########
#..########
#  ########
# $ $ $ $ #
#         #
##### #####
#         #
#    @    #
###########
`,
  `
##########
#        #
# $ $    #
#  $$    #
### ######
#        #
#..  @   #
#..      #
##########
`,
  `
############
#####      #
#     $ $  #
#     $ $  #
####  ######
####  ######
#  .....   #
#### #######
#### #######
## $ #######
## @ #######
############
`,
  `
###########
#####     #
#     $ $ #
#     $ $ #
##### #####
#         #
#      ...#
#      .  #
#####@#####
###########
`,
  `
#############
#     @     #
# $ $ $ $ $ #
### ##### ###
### ##### ###
#           #
#   .....   #
#############
`,
  `
#############
#     @     #
# $ $ $ $ $ #
####  #######
####  #######
#  ......   #
##### #######
#         $ #
#           #
#############
`,
  `
############
#    @     #
# $ $ $ $  #
## # #######
## # #######
# $ $  #####
#  #  ######
#  #  ######
# ......   #
############
`,
  `
##############
#     @      #
#  $$ $ $$$  #
#### #### ####
#### #### ####
#### #### ####
#### #### ####
#            #
#  ......    #
##############
`,
  `
#############
#     @     #
# $ $ $ $ $ #
##### # #####
##### # #####
#           #
#  .....    #
#############
`,
  `
##############
#     @      #
# $ $ $$ $ $ #
######  ######
######  ######
######  ######
######  ######
#            #
#  ......    #
##############
`,
  // L21: goal column behind a divider; a long detour corridor to the entry.
  `
############
#.#   #    #
#.# $ # $  #
#.# $ # $  #
#.#   #    #
#.# #####  #
#.#        #
#          #
#    $$    #
#     @    #
############
`,
  // L22: six boxes into a deep goal column, bottom pair parks first.
  `
##########
#.#      #
#.#  $ $ #
#.#  $ $ #
#.#      #
#.#      #
#.  $ $  #
#   @    #
##########
`,
  // L23: two shafts feed an offset goal room; only the right door works.
  `
##############
#            #
#  $ $ $     #
### ###### ###
#      ...   #
#      ...   #
### ###### ###
#  $ $ $     #
#      @     #
##############
`,
  // L24: deep two-cell shaft plus a blocking box below the shaft mouth.
  `
##############
#     @      #
# $ $ $$ $   #
######  ######
######  ######
######  ######
######  ######
#    $       #
#  ......    #
##############
`,
  // L25: goal column behind a divider; boxes detour around the tooth wall.
  `
############
#.#   #    #
#.# $ # $  #
#.# $ # $  #
#.#   #    #
#.# #####  #
#.#        #
#     $$   #
#     @    #
############
`,
  // L26: split goal pockets force fill order in both directions.
  `
##############
#     @      #
#  $$ $ $$$  #
#### #### ####
#### #### ####
#### #### ####
#### #### ####
#            #
#  ... ...   #
##############
`,
  // L27: two rooms joined by a single one-cell doorway; a six-box convoy in
  // the top room must queue through the shared door one box at a time, then
  // fan out to the ring of goals around the bottom room.
  `
##########
#   @    #
# $$$$$$ #
#        #
#        #
#### #####
# .    . #
#        #
#        #
#        #
#  ....  #
##########
`,
  // L28: seven boxes; the side chamber must be cleared before the shaft.
  `
############
#    @     #
# $ $ $ $  #
## # #######
## # #######
# $ $  #####
#  #$ ######
#  #  ######
# .......  #
############
`,
  // L29: eight boxes; four ride the single bottom shaft into the goal room.
  `
############
#   ....   #
#   ....   #
#####  #####
#          #
#  $ $ $ $ #
#          #
###@########
# $ $ $ $  #
#          #
############
`,
  // L30: divider column with a corridor tooth; tightest parking order.
  `
############
#.#   #    #
#.# $ # $  #
#.# $ # $  #
#.#   #    #
#.# #####  #
#.#  #     #
#     $$   #
#     @    #
############
`,
  // L31: expert tier. Side chamber must clear before the shaft convoy;
  // goal row offset against the chamber door.
  `
############
#  @       #
# $ $ $ $  #
## # #######
## # #######
# $ $  #####
#  #$ ######
#  #  ######
#  ....... #
############
`,
  // L32: three rooms chained by one 2-wide doorway each; middle-room
  // boxes queue through both doors in fill order.
  `
############
#    @     #
# $ $ $    #
####  ######
#          #
#  $ $ $   #
####  ######
#          #
#  ......  #
#          #
############
`,
  // L33: goal room fed by one shaft; goals offset from the drop column.
  `
############
#    ....  #
#    ....  #
#####  #####
#          #
#  $ $ $ $ #
#          #
###@########
# $ $ $ $  #
#          #
############
`,
  // L34: deep shaft with the blocker far left of the drop zone.
  `
##############
#     @      #
# $ $ $$ $ $ #
######  ######
######  ######
######  ######
######  ######
#    $       #
# .......    #
##############
`,
  // L35: three-room chain, no slack row below the goals.
  `
############
#    @     #
# $ $ $    #
####  ######
#          #
#  $ $ $   #
####  ######
#          #
#  ......  #
############
`,
  // L36: goal room with the goal block hugging the left wall.
  `
############
#  ....    #
#  ....    #
#####  #####
#          #
#  $ $ $ $ #
#          #
###@########
# $ $ $ $  #
#          #
############
`,
  // L37: goal room with the goal block hugging the right wall.
  `
############
#     .... #
#     .... #
#####  #####
#          #
#  $ $ $ $ #
#          #
###@########
# $ $ $ $  #
#          #
############
`,
  // L38: deep shaft, blocker just right of the drop zone.
  `
##############
#     @      #
# $ $ $$ $ $ #
######  ######
######  ######
######  ######
######  ######
#      $     #
#  .......   #
##############
`,
  // L39: deep shaft, blocker far right; longest repositioning detour.
  `
##############
#     @      #
# $ $ $$ $ $ #
######  ######
######  ######
######  ######
######  ######
#        $   #
# .......    #
##############
`,
  // L40: shallow shaft, blocker dead-center under the drop zone.
  `
##############
#     @      #
# $ $ $$ $ $ #
######  ######
######  ######
######  ######
#     $      #
#  .......   #
##############
`,
  // L41: deep shaft, blocker one off the drop zone; goals wide.
  `
##############
#     @      #
# $ $ $$ $ $ #
######  ######
######  ######
######  ######
######  ######
#     $      #
#  .......   #
##############
`,
  // L42: deep shaft, blocker right of center.
  `
##############
#     @      #
# $ $ $$ $ $ #
######  ######
######  ######
######  ######
######  ######
#       $    #
# .......    #
##############
`,
  // L43: shallow shaft, blocker dead-center, goals pulled left.
  `
##############
#     @      #
# $ $ $$ $ $ #
######  ######
######  ######
######  ######
#     $      #
# .......    #
##############
`,
  // L44: five-deep shaft with the blocker at the bottom; the drop-zone
  // box must shuttle fully around the stack.
  `
##############
#     @      #
# $ $ $$ $ $ #
######  ######
######  ######
######  ######
######  ######
######  ######
#     $      #
#  .......   #
##############
`,
  // L45: deep shaft, blocker hard against the left wall; the tightest
  // expert parking order.
  `
##############
#     @      #
# $ $ $$ $ $ #
######  ######
######  ######
######  ######
######  ######
#   $        #
# .......    #
##############
`,
]

/** Direction name -> (dr, dc). */
const DIRS: Record<string, [number, number]> = {
  up: [-1, 0],
  down: [1, 0],
  left: [0, -1],
  right: [0, 1],
}

/**
 * Parse level text into geometry + initial layout. Rows are padded to the
 * widest row; any non-wall character is walkable floor.
 * @param text - the level tiles.
 * @returns the parsed level.
 * @throws when the text has no rows, not exactly one player, or the box and
 *   goal counts differ.
 */
export function parseLevel(text: string): SokobanLevel {
  const lines = text.split('\n').map(l => l.replace(/\s+$/, '')).filter(l => l.length > 0)
  if (lines.length === 0) throw new Error('sokoban: empty level')
  const rows = lines.length
  const cols = Math.max(...lines.map(l => l.length))
  const walls: boolean[][] = []
  const goals: boolean[][] = []
  const boxes: boolean[][] = []
  let player: Position | null = null
  for (let r = 0; r < rows; r += 1) {
    const w: boolean[] = []
    const g: boolean[] = []
    const b: boolean[] = []
    for (let c = 0; c < cols; c += 1) {
      const ch = c < lines[r]!.length ? lines[r]![c]! : ' '
      w.push(ch === '#')
      g.push(ch === '.' || ch === '*' || ch === '+')
      b.push(ch === '$' || ch === '*')
      if (ch === '@' || ch === '+') {
        if (player !== null) throw new Error('sokoban: multiple players')
        player = { r, c }
      }
    }
    walls.push(w)
    goals.push(g)
    boxes.push(b)
  }
  if (player === null) throw new Error('sokoban: no player')
  const boxCount = boxes.flat().filter(Boolean).length
  const goalCount = goals.flat().filter(Boolean).length
  if (boxCount !== goalCount || boxCount === 0) {
    throw new Error(`sokoban: ${boxCount} boxes vs ${goalCount} goals`)
  }
  return { rows, cols, walls, goals, boxes, player }
}

/** Parse all built-in levels (validation happens in parseLevel). */
export function parseBuiltinLevels(): SokobanLevel[] {
  return LEVELS.map(parseLevel)
}

function inBounds(state: { rows: number; cols: number }, r: number, c: number): boolean {
  return r >= 0 && r < state.rows && c >= 0 && c < state.cols
}

/** Whether every box sits on a goal cell. */
export function isCleared(state: SokobanState): boolean {
  for (let r = 0; r < state.rows; r += 1) {
    for (let c = 0; c < state.cols; c += 1) {
      if (state.boxes[r]![c]! && !state.goals[r]![c]!) return false
    }
  }
  return true
}

/** Reset the state to the given level's initial layout, keeping the score. */
export function loadLevel(state: SokobanState, levelIndex: number): void {
  const level = parseLevel(LEVELS[levelIndex]!)
  state.levelIndex = levelIndex
  state.rows = level.rows
  state.cols = level.cols
  state.walls = level.walls
  state.goals = level.goals
  state.boxes = level.boxes.map(row => [...row])
  state.player = { ...level.player }
  state.moves = 0
  state.entryScore = state.score
  state.history = []
  state.cleared = false
}

/** Restart the current level (rolls the score back to the level entry). */
export function restartLevel(state: SokobanState): void {
  state.score = state.entryScore
  loadLevel(state, state.levelIndex)
}

/** localStorage key holding the highest level reached (1-based number). */
export const SOKOBAN_PROGRESS_KEY = 'dsh-minigames-sokoban-progress'

/**
 * Clamp a reached-level value into the valid 1..total range (non-finite or
 * non-positive input degrades to 1).
 * @param reached - raw stored or derived value.
 * @param total - number of built-in levels.
 * @returns the clamped 1-based reached level.
 */
export function clampReached(reached: number, total: number): number {
  if (!Number.isFinite(reached) || reached < 1) return 1
  return Math.min(total, Math.trunc(reached))
}

/**
 * Unlock rule: a 1-based level number is playable when it is at most
 * max(reached, 1) — level 1 is always unlocked.
 */
export function isLevelUnlocked(level: number, reached: number): boolean {
  return level >= 1 && level <= Math.max(reached, 1)
}

/**
 * Progress after clearing a level: the reached value grows past it, never
 * shrinks.
 * @param level - the cleared level, 1-based.
 */
export function nextReached(reached: number, level: number): number {
  return Math.max(reached, level + 1)
}

/**
 * Session-only reached level used when localStorage is unavailable (sandboxed
 * iframe): progress then survives level jumps within the session only.
 */
let sessionReached: number | null = null

/**
 * Read the highest level reached, clamped to 1..total. Falls back to the
 * session-only copy when storage access throws.
 * @param total - number of built-in levels.
 */
export function loadReached(total: number): number {
  let raw: number | null = sessionReached
  try {
    if (raw === null && typeof localStorage !== 'undefined') {
      const parsed = Number(localStorage.getItem(SOKOBAN_PROGRESS_KEY))
      if (parsed >= 1) raw = parsed
    }
  } catch (e) {
    // Sandboxed iframe without storage access: keep session-only progress.
    void e
  }
  const reached = clampReached(raw ?? 1, total)
  sessionReached = reached
  return reached
}

/**
 * Persist the highest level reached (localStorage when available, plus the
 * session-only copy).
 */
export function saveReached(reached: number): void {
  sessionReached = reached
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SOKOBAN_PROGRESS_KEY, String(reached))
    }
  } catch (e) {
    // Sandboxed iframe without storage access: the session copy above is it.
    void e
  }
}

/**
 * A fresh state on the given level.
 * @param levelIndex - built-in level to load (0-based).
 * @param score - score carried in from previous levels.
 */
export function createSokobanState(levelIndex = 0, score = 0): SokobanState {
  const state: SokobanState = {
    levelIndex: 0,
    rows: 0,
    cols: 0,
    walls: [],
    goals: [],
    boxes: [],
    player: { r: 0, c: 0 },
    moves: 0,
    score,
    entryScore: score,
    history: [],
    cleared: false,
  }
  loadLevel(state, levelIndex)
  return state
}

/**
 * Try to move the player one cell in `dir` (up/down/left/right), pushing a
 * single box when the target cell holds one and the cell beyond it is free
 * (floor or goal). Updates moves/score/history/cleared on success.
 * @returns the applied move, or null when blocked (wall, box-into-wall,
 *   box-into-box) or the level is already cleared.
 */
export function applyMove(state: SokobanState, dir: 'up' | 'down' | 'left' | 'right'): SokobanMove | null {
  if (state.cleared) return null
  const [dr, dc] = DIRS[dir]!
  const from = state.player
  const tr = from.r + dr
  const tc = from.c + dc
  if (!inBounds(state, tr, tc) || state.walls[tr]![tc]!) return null
  const move: SokobanMove = {
    playerFrom: { ...from },
    playerTo: { r: tr, c: tc },
    boxFrom: null,
    boxTo: null,
    scored: false,
    cleared: false,
  }
  if (state.boxes[tr]![tc]!) {
    const br = tr + dr
    const bc = tc + dc
    if (!inBounds(state, br, bc) || state.walls[br]![bc]! || state.boxes[br]![bc]!) return null
    state.boxes[tr]![tc]! = false
    state.boxes[br]![bc]! = true
    move.boxFrom = { r: tr, c: tc }
    move.boxTo = { r: br, c: bc }
    if (state.goals[br]![bc]!) {
      move.scored = true
      state.score += BOX_SCORE
    }
  }
  state.player = { r: tr, c: tc }
  state.moves += 1
  if (isCleared(state)) {
    move.cleared = true
    state.cleared = true
    state.score += CLEAR_SCORE
  }
  state.history.push(move)
  return move
}

/**
 * Undo the last move: restore the player, the pushed box, the move count,
 * the score, and the cleared flag exactly.
 * @returns the undone move, or null when there is nothing to undo.
 */
export function undoMove(state: SokobanState): SokobanMove | null {
  const move = state.history.pop()
  if (move === undefined) return null
  if (move.boxTo !== null && move.boxFrom !== null) {
    state.boxes[move.boxTo.r]![move.boxTo.c]! = false
    state.boxes[move.boxFrom.r]![move.boxFrom.c]! = true
    if (move.scored) state.score -= BOX_SCORE
  }
  if (move.cleared) {
    state.cleared = false
    state.score -= CLEAR_SCORE
  }
  state.player = { ...move.playerFrom }
  state.moves -= 1
  return move
}
