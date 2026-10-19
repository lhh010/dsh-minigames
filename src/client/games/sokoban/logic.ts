/**
 * 推箱子 (Sokoban) pure logic: grid parsing/validation, player moves with
 * single-box pushes, undo with full state restore, and clear detection.
 * Deterministic functions over a plain state object; no DOM. The game
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
 * The 10 built-in levels, microban-style, ≤ 12x12, ordered by difficulty.
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
# .$ $. #
# $     #
# .     #
#   @   #
#########
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
