/**
 * Gomoku (五子棋) pure logic: 15x15 board, two players alternate placing
 * stones; five in a row wins. A simple heuristic AI scores candidate moves by
 * attack + defense line evaluation. Deterministic functions over a plain state
 * object.
 */

export const SIZE = 15
export type Cell = 0 | 1 | 2 // 0 empty, 1 black (player), 2 white (AI)

export interface GomokuState {
  board: Cell[][]
  /** Whose turn: 1 = player, 2 = AI. */
  turn: Cell
  winner: Cell
  over: boolean
}

export interface Move { r: number; c: number }

/** A fresh empty board; the player moves first. */
export function createGomokuState(): GomokuState {
  const board = Array.from({ length: SIZE }, () => Array<Cell>(SIZE).fill(0))
  return { board, turn: 1, winner: 0, over: false }
}

const DIRS: readonly [number, number][] = [[0, 1], [1, 0], [1, 1], [1, -1]]

/** The length of a line through (r, c) in direction (dr, dc), centred. */
function lineLength(board: Cell[][], r: number, c: number, dr: number, dc: number, stone: Cell): number {
  let count = 1
  for (const sign of [-1, 1] as const) {
    let nr = r + dr * sign
    let nc = c + dc * sign
    while (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && board[nr]![nc] === stone) {
      count += 1
      nr += dr * sign
      nc += dc * sign
    }
  }
  return count
}

/** Check for a win after the last move at (r, c). */
export function checkWin(board: Cell[][], r: number, c: number): boolean {
  const stone = board[r]![c]!
  if (stone === 0) return false
  for (const [dr, dc] of DIRS) {
    if (lineLength(board, r, c, dr, dc, stone) >= 5) return true
  }
  return false
}

/** Place a stone for the current turn; advances the turn and checks the win. */
export function place(state: GomokuState, r: number, c: number): boolean {
  if (state.over || state.board[r]![c] !== 0) return false
  state.board[r]![c] = state.turn
  if (checkWin(state.board, r, c)) {
    state.winner = state.turn
    state.over = true
    return true
  }
  // Board full = draw.
  if (state.board.flat().every(v => v !== 0)) {
    state.winner = 0
    state.over = true
    return true
  }
  state.turn = state.turn === 1 ? 2 : 1
  return true
}

/**
 * Heuristic score for one move of `stone`: sum of line scores for every line
 * through the move. Live lines (open both ends) score higher; length^2 growth
 * makes longer threats far more valuable.
 */
function scoreMove(board: Cell[][], r: number, c: number, stone: Cell): number {
  let total = 0
  for (const [dr, dc] of DIRS) {
    let count = 1
    let open = 0
    for (const sign of [-1, 1] as const) {
      let nr = r + dr * sign
      let nc = c + dc * sign
      while (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && board[nr]![nc] === stone) {
        count += 1
        nr += dr * sign
        nc += dc * sign
      }
      if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && board[nr]![nc] === 0) open += 1
    }
    const live = open >= 2 ? 2 : open === 1 ? 1 : 0
    total += count * count * (live + 1)
  }
  return total
}

/**
 * Choose the AI's move: winning moves first, then blocking the player's
 * winning moves, then the best scored empty cell near existing stones.
 */
export function chooseAiMove(state: GomokuState): Move | null {
  const empties: Move[] = []
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      if (state.board[r]![c] === 0) empties.push({ r, c })
    }
  }
  if (empties.length === 0) return null

  // Immediate win for AI.
  for (const m of empties) {
    state.board[m.r]![m.c] = 2
    if (checkWin(state.board, m.r, m.c)) {
      state.board[m.r]![m.c] = 0
      return m
    }
    state.board[m.r]![m.c] = 0
  }
  // Block the player's immediate win.
  for (const m of empties) {
    state.board[m.r]![m.c] = 1
    if (checkWin(state.board, m.r, m.c)) {
      state.board[m.r]![m.c] = 0
      return m
    }
    state.board[m.r]![m.c] = 0
  }
  // Best scored move (attack + defense) near existing stones.
  let best: Move | null = null
  let bestScore = -1
  for (const m of empties) {
    // Only consider cells near existing stones (3x3 neighbourhood).
    let near = false
    for (let dr = -2; dr <= 2 && !near; dr += 1) {
      for (let dc = -2; dc <= 2; dc += 1) {
        const nr = m.r + dr
        const nc = m.c + dc
        if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && state.board[nr]![nc] !== 0) {
          near = true
          break
        }
      }
    }
    if (!near) continue
    const attack = scoreMove(state.board, m.r, m.c, 2)
    const defense = scoreMove(state.board, m.r, m.c, 1)
    const score = attack * 1.1 + defense
    if (score > bestScore) {
      bestScore = score
      best = m
    }
  }
  // Fallback: centre-most empty cell.
  return best ?? empties[Math.floor(empties.length / 2)]!
}
