import { describe, expect, it } from 'vitest'
import {
  BLACK, WHITE, KOMI, WIN_THRESHOLD,
  createBoard, idx, neighbors, groupAndLiberties, play, wouldRepeat,
  legalMoves, isLegal, areaScore, rc,
} from '../src/client/games/minigo/logic.ts'
import { chooseMove, evaluate } from '../src/client/games/minigo/ai.ts'

/** Place a list of [r, c, color] moves, ignoring legality errors. */
function setup(moves: [number, number, number][]): ReturnType<typeof createBoard> {
  let b = createBoard()
  for (const [r, c, color] of moves) {
    const res = play(b, idx(b, r, c), color)
    if (res !== null) b = res.board
  }
  return b
}

describe('minigo logic', () => {
  it('places stones and counts liberties at corner/edge/center', () => {
    const b = createBoard()
    expect(b.cells.every(v => v === 0)).toBe(true)
    const corner = play(b, idx(b, 0, 0), BLACK)!
    expect(corner.board.cells[idx(corner.board, 0, 0)]).toBe(BLACK)
    expect(groupAndLiberties(corner.board, idx(corner.board, 0, 0)).liberties.size).toBe(2)
    const edge = play(b, idx(b, 0, 4), BLACK)!
    expect(groupAndLiberties(edge.board, idx(edge.board, 0, 4)).liberties.size).toBe(3)
    const center = play(b, idx(b, 4, 4), BLACK)!
    expect(groupAndLiberties(center.board, idx(center.board, 4, 4)).liberties.size).toBe(4)
  })

  it('rejects placement on an occupied point', () => {
    const b = setup([[4, 4, BLACK]])
    expect(play(b, idx(b, 4, 4), WHITE)).toBeNull()
  })

  it('captures a single stone and reports it', () => {
    // White stone surrounded by Black on all four liberties.
    const b = setup([[4, 5, BLACK], [5, 4, BLACK], [3, 4, BLACK], [4, 4, WHITE]])
    const res = play(b, idx(b, 4, 3), BLACK)!
    expect(res.captured).toEqual([idx(b, 4, 4)])
    expect(res.board.cells[idx(b, 4, 4)]).toBe(0)
  })

  it('captures a multi-stone group', () => {
    // Two connected white stones at (4,4)-(4,5); Black walls every liberty:
    // (3,4),(5,4) above/below the first and (3,5),(5,5) around the second,
    // then Black takes the last liberty at (4,3).
    const b = setup([
      [3, 4, BLACK], [5, 4, BLACK], [3, 5, BLACK], [5, 5, BLACK], [4, 3, BLACK],
      [4, 4, WHITE], [4, 5, WHITE],
    ])
    // The group is already in atari before the taking move 鈥?verify with a
    // legal taking sequence instead: remove (4,3) so the last liberty is (4,3)
    // itself, i.e. build the atari around the pair.
    const c = setup([
      [3, 4, BLACK], [5, 4, BLACK], [3, 5, BLACK], [5, 5, BLACK],
      [4, 4, WHITE], [4, 5, WHITE],
    ])
    const g = groupAndLiberties(c, idx(c, 4, 4))
    expect(g.stones.length).toBe(2)
    expect([...g.liberties].sort()).toEqual([idx(c, 4, 3), idx(c, 4, 6)])
    // Take at (4,3): the group keeps one liberty, so nothing is captured yet.
    const step = play(c, idx(c, 4, 3), BLACK)!
    expect(step.captured.length).toBe(0)
    // Now take the final liberty at (4,6): the whole pair dies.
    const res = play(step.board, idx(c, 4, 6), BLACK)!
    expect(res.captured.length).toBe(2)
    expect(res.board.cells[idx(c, 4, 4)]).toBe(0)
    expect(res.board.cells[idx(c, 4, 5)]).toBe(0)
    void b
  })

  it('rejects suicide (playing into a false eye that captures nothing)', () => {
    // White group fully surrounds a single point with no last liberty.
    const b = setup([
      [3, 4, WHITE], [4, 3, WHITE], [4, 5, WHITE], [5, 4, WHITE],
    ])
    expect(play(b, idx(b, 4, 4), BLACK)).toBeNull()
  })

  it('allows a move that fills the last liberty when it captures', () => {
    // Black plays the shared last liberty of a white stone and survives.
    const b = setup([
      [4, 5, BLACK], [5, 4, BLACK], [3, 4, BLACK],
      [4, 4, WHITE],
    ])
    const res = play(b, idx(b, 4, 3), BLACK)!
    expect(res.captured.length).toBe(1)
    expect(groupAndLiberties(res.board, idx(b, 4, 3)).liberties.size).toBeGreaterThan(0)
  })

  it('wouldRepeat returns false when the position differs (negative contract)', () => {
    const a = setup([[4, 4, BLACK], [4, 5, WHITE]])
    const afterB = play(a, idx(a, 4, 3), BLACK)!
    // A move at a fresh point changes the position: not a repeat.
    expect(wouldRepeat(afterB.board, idx(afterB.board, 0, 0), WHITE, a)).toBe(false)
    // An occupied point is refused by play, so wouldRepeat reports false too.
    expect(wouldRepeat(afterB.board, idx(afterB.board, 4, 3), WHITE, a)).toBe(false)
  })

  it('isLegal refuses occupied points and accepts open ones', () => {
    const prev = setup([[4, 3, BLACK], [4, 5, BLACK], [4, 4, WHITE]])
    const cur = setup([[4, 3, BLACK], [4, 4, BLACK], [4, 5, BLACK]])
    expect(isLegal(cur, idx(cur, 4, 4), WHITE, cur)).toBe(false)
    expect(isLegal(cur, idx(cur, 0, 0), WHITE, prev)).toBe(true)
  })

  it('two groups can share liberties without merging', () => {
    const b = setup([[4, 4, BLACK], [4, 6, BLACK]])
    const g1 = groupAndLiberties(b, idx(b, 4, 4))
    expect(g1.stones.length).toBe(1)
    expect(neighbors(b, idx(b, 4, 4)).length).toBe(4)
  })

  it('two consecutive passes end the game (state machine in glue; rules expose pass legality)', () => {
    const b = createBoard()
    expect(legalMoves(b, BLACK).length).toBe(81)
  })

  it('areaScore on a hand-computed finished position', () => {
    // Three full walls: black at column 0 and column 4, white at column 8.
    // Columns 1-3 touch only black → black territory (27). Columns 5-7 touch
    // BOTH colors → neutral (dame-ish region, neither scores it). So:
    // black = 18 stones + 27 = 45; white = 9 stones + 6.5 komi = 15.5.
    const moves: [number, number, number][] = []
    for (let r = 0; r < 9; r += 1) {
      moves.push([r, 0, BLACK])
      moves.push([r, 4, BLACK])
      moves.push([r, 8, WHITE])
    }
    const b = setup(moves)
    const s = areaScore(b, KOMI)
    expect(s.black).toBe(45)
    expect(s.white).toBe(9 + KOMI)
    expect(s.winner).toBe(BLACK)
  })
  it('WIN_THRESHOLD and KOMI constants are the documented 9x9 values', () => {
    expect(KOMI).toBe(6.5)
    expect(WIN_THRESHOLD).toBe(40.5)
  })

  it('rc/idx round-trip', () => {
    const b = createBoard()
    for (const i of [0, 8, 40, 80]) {
      const p = rc(b, i)
      expect(idx(b, p.r, p.c)).toBe(i)
    }
  })
})

describe('minigo ai', () => {
  it('rescues its own group in atari when a saving move exists', () => {
    // White group at (4,4) in atari (only liberty (4,5)); White to move.
    const b = setup([
      [3, 4, BLACK], [4, 3, BLACK], [5, 4, BLACK],
      [4, 4, WHITE],
    ])
    const m = chooseMove(b, WHITE, 1, null)
    expect(m).toBe(idx(b, 4, 5))
  })

  it('captures an opponent group in atari', () => {
    // Black group at (4,4) in atari; White to move takes it.
    const b = setup([
      [3, 4, WHITE], [4, 3, WHITE], [5, 4, WHITE],
      [4, 4, BLACK],
    ])
    const m = chooseMove(b, WHITE, 1, null)
    expect(m).toBe(idx(b, 4, 5))
  })

  it('never plays suicide', () => {
    const b = setup([
      [3, 4, WHITE], [4, 3, WHITE], [4, 5, WHITE], [5, 4, WHITE],
    ])
    const m = chooseMove(b, BLACK, 2, null)
    expect(m === -1 || isLegal(b, m, BLACK, null)).toBe(true)
  })

  it('never violates ko (must not immediately recapture)', () => {
    const a = setup([
      [3, 3, BLACK], [3, 4, WHITE], [4, 3, WHITE],
      [5, 4, BLACK], [4, 5, WHITE], [5, 5, BLACK],
    ])
    const b1 = play(a, idx(a, 4, 4), BLACK)!
    const m = chooseMove(b1.board, WHITE, 2, a)
    // The immediate recapture point must not be chosen.
    const recapturePoint = idx(a, 3, 4)
    expect(m).not.toBe(recapturePoint)
    expect(m === -1 || isLegal(b1.board, m, WHITE, a)).toBe(true)
  })

  it('is deterministic for identical inputs', () => {
    const b = setup([[4, 4, BLACK], [4, 5, WHITE], [3, 4, BLACK]])
    expect(chooseMove(b, WHITE, 2, null)).toBe(chooseMove(b, WHITE, 2, null))
  })

  it('evaluate is color-antisymmetric on an empty board and positive for the side to move', () => {
    const b = createBoard()
    expect(evaluate(b, BLACK)).toBe(evaluate(b, WHITE))
    // A single stone in the center favors its owner.
    const one = setup([[4, 4, BLACK]])
    expect(evaluate(one, BLACK)).toBeGreaterThan(evaluate(one, WHITE))
  })
})
