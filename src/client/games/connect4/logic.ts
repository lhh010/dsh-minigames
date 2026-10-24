/**
 * Connect Four pure rules: a 7-column x 6-row board stored column-major as a
 * flat Int8Array (index = col * ROWS + row; row 0 is the BOTTOM). 0 empty,
 * 1 = red (player), 2 = yellow (AI). All functions are pure.
 */

export const COLS = 7
export const ROWS = 6
export const RED = 1
export const YELLOW = 2

export type Cell = 0 | 1 | 2
export type Board = Int8Array

export function createBoard(): Board {
  return new Int8Array(COLS * ROWS)
}

export function inBounds(col: number, row: number): boolean {
  return col >= 0 && col < COLS && row >= 0 && row < ROWS
}

export function at(board: Board, col: number, row: number): Cell {
  return board[col * ROWS + row] as Cell
}

/** The row a disc dropped into `col` would land on, or -1 when full. */
export function dropRow(board: Board, col: number): number {
  if (col < 0 || col >= COLS) return -1
  for (let r = 0; r < ROWS; r += 1) {
    if (at(board, col, r) === 0) return r
  }
  return -1
}

export function legalColumns(board: Board): number[] {
  const out: number[] = []
  for (let c = 0; c < COLS; c += 1) if (dropRow(board, c) >= 0) out.push(c)
  return out
}

export function isFull(board: Board): boolean {
  return legalColumns(board).length === 0
}

/** Drop color into col; returns the new board and the landing row, or null. */
export function drop(board: Board, col: number, color: 1 | 2): { board: Board; row: number } | null {
  const row = dropRow(board, col)
  if (row < 0) return null
  const next = board.slice()
  next[col * ROWS + row] = color
  return { board: next, row }
}

/** All 69 length-4 windows as flat index quadruples (computed once). */
export const WINDOWS: readonly [number, number, number, number][] = (() => {
  const out: [number, number, number, number][] = []
  const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]] as const
  for (let c = 0; c < COLS; c += 1) {
    for (let r = 0; r < ROWS; r += 1) {
      for (const [dc, dr] of dirs) {
        const c1 = c + dc * 3
        const r1 = r + dr * 3
        if (!inBounds(c1, r1)) continue
        const idx = [0, 1, 2, 3].map(k => (c + dc * k) * ROWS + (r + dr * k)) as [number, number, number, number]
        out.push(idx)
      }
    }
  }
  return out
})()

/** The winning line's four cells, or null. */
export function findWinner(board: Board): { color: 1 | 2; cells: [number, number, number, number] } | null {
  for (const w of WINDOWS) {
    const v = board[w[0]!]!
    if (v === 0) continue
    if (board[w[1]!] === v && board[w[2]!] === v && board[w[3]!] === v) {
      return { color: v as 1 | 2, cells: w }
    }
  }
  return null
}

export function isWin(board: Board, color: 1 | 2): boolean {
  for (const w of WINDOWS) {
    if (board[w[0]!] === color && board[w[1]!] === color && board[w[2]!] === color && board[w[3]!] === color) return true
  }
  return false
}

export type GameResult = 'playing' | 'red' | 'yellow' | 'draw'

export function result(board: Board): GameResult {
  const w = findWinner(board)
  if (w !== null) return w.color === RED ? 'red' : 'yellow'
  return isFull(board) ? 'draw' : 'playing'
}

/** Convert a flat index to column/row. */
export function toColRow(i: number): { col: number; row: number } {
  return { col: Math.floor(i / ROWS), row: i % ROWS }
}

/** Convert column/row to the flat index. */
export function toIndex(col: number, row: number): number {
  return col * ROWS + row
}
