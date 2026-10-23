import { describe, expect, it } from 'vitest'
import {
  BOARD_MASK, CENTER, LEVELS, SIZE, START_BOARDS,
  applyMove, isWin, jumpedPeg, legalMoves, pegCount,
} from '../src/client/games/peg/logic.ts'

/** Board coordinate helper: r*7+c. */
const at = (r: number, c: number): number => r * SIZE + c

describe('peg logic', () => {
  it('BOARD_MASK marks exactly the 33 holes of the English cross', () => {
    expect(BOARD_MASK.length).toBe(49)
    let holes = 0
    for (let i = 0; i < 49; i += 1) if (BOARD_MASK[i] === 1) holes += 1
    expect(holes).toBe(33)
    // The four 2x2 corner blocks are NOT holes; the center is.
    for (const r of [0, 1, 5, 6]) for (const c of [0, 1, 5, 6]) expect(BOARD_MASK[at(r, c)]).toBe(0)
    expect(BOARD_MASK[CENTER]).toBe(1)
  })

  it('start boards: L1/L2 have 32 pegs with an empty center; L3 cross has 13', () => {
    expect(pegCount(START_BOARDS[0]!)).toBe(32)
    expect(START_BOARDS[0]![CENTER]).toBe(0)
    expect(START_BOARDS[1]).toEqual(START_BOARDS[0])
    expect(pegCount(START_BOARDS[2]!)).toBe(12)
    expect(START_BOARDS[2]![CENTER]).toBe(0)
    for (let r = 0; r < SIZE; r += 1) {
      for (let c = 0; c < SIZE; c += 1) {
        const expected = (r === 3 || c === 3) && r * SIZE + c !== CENTER ? 1 : 0
        expect(START_BOARDS[2]![at(r, c)]).toBe(expected)
      }
    }
  })

  it('applyMove performs a legal jump in all four directions and removes the jumped peg', () => {
    // Tiny position: pegs at (3,1),(3,2); landing (3,3) empty.
    const base = new Uint8Array(49)
    base[at(3, 1)] = 1
    base[at(3, 2)] = 1
    const right = applyMove(base, at(3, 1), at(3, 3))
    expect(right).not.toBeNull()
    expect(right![at(3, 1)]).toBe(0)
    expect(right![at(3, 2)]).toBe(0) // jumped peg removed
    expect(right![at(3, 3)]).toBe(1)
    // Left: pegs at (3,3),(3,2), landing (3,1).
    const leftBoard = new Uint8Array(49)
    leftBoard[at(3, 3)] = 1
    leftBoard[at(3, 2)] = 1
    const left = applyMove(leftBoard, at(3, 3), at(3, 1))
    expect(left![at(3, 1)]).toBe(1)
    expect(left![at(3, 2)]).toBe(0)
    // Up: pegs at (5,3),(4,3), landing (3,3).
    const upBoard = new Uint8Array(49)
    upBoard[at(5, 3)] = 1
    upBoard[at(4, 3)] = 1
    const up = applyMove(upBoard, at(5, 3), at(3, 3))
    expect(up![at(3, 3)]).toBe(1)
    expect(up![at(4, 3)]).toBe(0)
    // Down: pegs at (1,3),(2,3), landing (3,3).
    const downBoard = new Uint8Array(49)
    downBoard[at(1, 3)] = 1
    downBoard[at(2, 3)] = 1
    const down = applyMove(downBoard, at(1, 3), at(3, 3))
    expect(down![at(3, 3)]).toBe(1)
    expect(down![at(2, 3)]).toBe(0)
  })

  it('applyMove rejects illegal jumps: empty source, missing jumped peg, occupied landing, off-board, off-mask', () => {
    const board = new Uint8Array(49)
    board[at(3, 1)] = 1
    board[at(3, 2)] = 1
    board[at(3, 4)] = 1
    // No peg at the source.
    expect(applyMove(board, at(3, 3), at(3, 1))).toBeNull()
    // No peg between source and landing (3,1) -> (3,3) needs (3,2) — present; use (1,3)->(3,3): no peg at (2,3).
    const sparse = new Uint8Array(49)
    sparse[at(1, 3)] = 1
    expect(applyMove(sparse, at(1, 3), at(3, 3))).toBeNull()
    // Occupied landing: (3,1) jumps right but (3,3) holds a peg in this constructed board.
    const occ = new Uint8Array(49)
    occ[at(3, 1)] = 1
    occ[at(3, 2)] = 1
    occ[at(3, 3)] = 1
    expect(applyMove(occ, at(3, 1), at(3, 3))).toBeNull()
    // Off-board landing (row 3 -> row 5 fine; use target beyond board via raw bad index).
    expect(applyMove(board, at(6, 3), at(8, 3))).toBeNull()
    // Off-mask: (1,1) is not a hole at all.
    expect(applyMove(board, at(1, 1), at(3, 1))).toBeNull()
    // Distance 1 or diagonal are not jumps.
    expect(applyMove(board, at(3, 1), at(3, 2))).toBeNull()
    expect(applyMove(board, at(3, 1), at(1, 3))).toBeNull()
  })

  it('jumpedPeg only accepts 2-step orthogonal lines', () => {
    expect(jumpedPeg(at(3, 1), at(3, 3))).toBe(at(3, 2))
    expect(jumpedPeg(at(1, 3), at(3, 3))).toBe(at(2, 3))
    expect(jumpedPeg(at(3, 1), at(3, 2))).toBeNull()
    expect(jumpedPeg(at(2, 2), at(4, 4))).toBeNull()
  })

  it('legalMoves lists every jump on a tiny constructed position', () => {
    const board = new Uint8Array(49)
    board[at(3, 1)] = 1
    board[at(3, 2)] = 1
    board[at(3, 4)] = 1
    // (3,1)->(3,3) and (3,2)->(3,0) (over (3,1), landing on the arm tip).
    expect(legalMoves(board)).toEqual([[at(3, 1), at(3, 3)], [at(3, 2), at(3, 0)]])
    // Add (1,3)+(2,3): two more jumps — down into (3,3) and out to (0,3).
    board[at(1, 3)] = 1
    board[at(2, 3)] = 1
    const moves = legalMoves(board)
    expect(moves).toHaveLength(4)
    expect(moves).toContainEqual([at(1, 3), at(3, 3)])
  })

  it('L1 and L3 start positions both have legal moves', () => {
    for (const board of [START_BOARDS[0]!, START_BOARDS[2]!]) {
      expect(legalMoves(board).length).toBeGreaterThan(0)
    }
  })

  it('applyMove does not mutate the source board and reversed move is illegal afterwards', () => {
    const board = START_BOARDS[0]!.slice()
    const snapshot = board.slice()
    const first = legalMoves(board)[0]!
    const next = applyMove(board, first[0], first[1])
    expect(next).not.toBeNull()
    expect(board).toEqual(snapshot) // pure
    // Replaying the same from/to on the new board: source is now empty.
    expect(applyMove(next!, first[0], first[1])).toBeNull()
    // The exact inverse (to -> from) is also illegal: jumped peg is gone.
    expect(applyMove(next!, first[1], first[0])).toBeNull()
  })

  it('undo round-trip: rewinding is expressed by restoring the pre-move board', () => {
    const board = START_BOARDS[0]!.slice()
    const move = legalMoves(board)[0]!
    const next = applyMove(board, move[0], move[1])!
    // Glue-level undo = pop the stored pre-move board.
    expect(pegCount(next)).toBe(pegCount(board) - 1)
    expect(board).toEqual(START_BOARDS[0]!)
  })

  it('isWin: each level goal — center for L1, anywhere for L2/L3, false while >1 peg', () => {
    expect(LEVELS[0]!.goal).toBe('center')
    expect(LEVELS[1]!.goal).toBe('any')
    expect(LEVELS[2]!.goal).toBe('any')
    const centerOnly = new Uint8Array(49)
    centerOnly[CENTER] = 1
    const cornerOnly = new Uint8Array(49)
    cornerOnly[at(2, 2)] = 1
    const two = new Uint8Array(49)
    two[CENTER] = 1
    two[at(3, 2)] = 1
    for (let level = 0; level < 3; level += 1) {
      expect(isWin(centerOnly, level)).toBe(true)
      expect(isWin(two, level)).toBe(false)
      expect(isWin(new Uint8Array(49), level)).toBe(false) // 0 pegs is not a win
    }
    expect(isWin(cornerOnly, 0)).toBe(false) // L1 demands the center
    expect(isWin(cornerOnly, 1)).toBe(true)
    expect(isWin(cornerOnly, 2)).toBe(true)
    expect(isWin(centerOnly, 99)).toBe(false) // unknown level
  })

  it('win detection vector: play a known line down to one peg and win L2', () => {
    // Start from a small solved-by-construction line: pegs at (3,1),(3,2).
    let board: Uint8Array | null = new Uint8Array(49)
    board[at(3, 1)] = 1
    board[at(3, 2)] = 1
    board = applyMove(board, at(3, 1), at(3, 3))
    expect(board).not.toBeNull()
    expect(pegCount(board!)).toBe(1)
    expect(isWin(board!, 1)).toBe(true) // any single peg wins L2
    expect(isWin(board!, 0)).toBe(true) // it landed exactly at the center
  })
})
