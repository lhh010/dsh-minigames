import { describe, expect, it } from 'vitest'
import {
  CASTLE_BK, CASTLE_BQ, CASTLE_WK, CASTLE_WQ, algebraic, applyMove, createStartPosition,
  inCheck, insufficientMaterial, legalMoves, positionKey, positionWith, sq, status,
} from '../src/client/games/chess/logic.ts'
import { chooseMove, evaluate, mulberry32 } from '../src/client/games/chess/ai.ts'

/** Names of `from` squares of every legal move. */
function fromSquares(pos: ReturnType<typeof positionWith>): string[] {
  return legalMoves(pos).map(m => algebraic(m.from))
}

function moveTo(pos: ReturnType<typeof positionWith>, from: string, to: string): string[] {
  return legalMoves(pos).filter(m => algebraic(m.from) === from && algebraic(m.to) === to).map(m => m.promo)
}

describe('chess move generation', () => {
  it('generates 20 legal moves from the start position', () => {
    expect(legalMoves(createStartPosition())).toHaveLength(20)
  })

  it('pawn: single push, blocked push, and double push', () => {
    // White pawn e2; black pawn e4 blocks the file but d7 allows its own double.
    const pos = positionWith([['e2', 'P'], ['e4', 'p'], ['d7', 'p'], ['e7', 'p'], ['a1', 'K'], ['a8', 'k']])
    const moves = legalMoves(pos).filter(m => algebraic(m.from) === 'e2')
    expect(moves.map(m => algebraic(m.to)).sort()).toEqual(['e3'])
    const open = positionWith([['e2', 'P'], ['a1', 'K'], ['a8', 'k']])
    const om = legalMoves(open).filter(m => algebraic(m.from) === 'e2')
    expect(om.map(m => algebraic(m.to)).sort()).toEqual(['e3', 'e4'])
  })

  it('pawn: diagonal capture and four promotion options', () => {
    const pos = positionWith([['e7', 'P'], ['d8', 'r'], ['a1', 'K'], ['a8', 'k']])
    expect(moveTo(pos, 'e7', 'e8')).toEqual(['q', 'r', 'b', 'n'])
    expect(moveTo(pos, 'e7', 'd8')).toEqual(['q', 'r', 'b', 'n'])
  })

  it('en passant captures the bypassed pawn and double pushes set the ep square', () => {
    const pos = positionWith([['e5', 'P'], ['d5', 'p'], ['a1', 'K'], ['a8', 'k']], { ep: sq('d6') })
    const ep = legalMoves(pos).find(m => m.enPassant)
    expect(ep).toBeDefined()
    expect(algebraic(ep!.to)).toBe('d6')
    const next = applyMove(pos, ep!)
    expect(next.board[sq('d5')]).toBe('')
    expect(next.board[sq('d6')]).toBe('P')
    const start = createStartPosition()
    const e4 = legalMoves(start).find(m => algebraic(m.from) === 'e2' && algebraic(m.to) === 'e4')!
    expect(applyMove(start, e4).ep).toBe(sq('e3'))
  })

  it('knight jumps ignore blockers and cannot land on own pieces', () => {
    const pos = positionWith([['d4', 'N'], ['e6', 'P'], ['c6', 'p'], ['a1', 'K'], ['a8', 'k']])
    const tos = legalMoves(pos).filter(m => algebraic(m.from) === 'd4').map(m => algebraic(m.to)).sort()
    expect(tos).toEqual(['b3', 'b5', 'c2', 'c6', 'e2', 'f3', 'f5'])
  })

  it('bishop slides until blocked; own piece stops, enemy piece is capturable', () => {
    const pos = positionWith([['c1', 'B'], ['f4', 'P'], ['a3', 'p'], ['a2', 'p'], ['h1', 'K'], ['h8', 'k']])
    const tos = legalMoves(pos).filter(m => algebraic(m.from) === 'c1').map(m => algebraic(m.to)).sort()
    expect(tos).toEqual(['a3', 'b2', 'd2', 'e3'])
  })

  it('rook slides along ranks and files', () => {
    const pos = positionWith([['d4', 'R'], ['d7', 'p'], ['f4', 'p'], ['h1', 'K'], ['h8', 'k']])
    const tos = legalMoves(pos).filter(m => algebraic(m.from) === 'd4').map(m => algebraic(m.to)).sort()
    expect(tos).toEqual(['a4', 'b4', 'c4', 'd1', 'd2', 'd3', 'd5', 'd6', 'd7', 'e4', 'f4'])
  })

  it('queen combines rook and bishop sliding', () => {
    const pos = positionWith([['d4', 'Q'], ['h1', 'K'], ['a8', 'k']])
    const tos = legalMoves(pos).filter(m => algebraic(m.from) === 'd4').map(m => algebraic(m.to))
    expect(tos).toHaveLength(27) // 7 file + 7 rank + 13 diagonal squares, nothing blocked
  })

  it('king moves one square; White castles both sides when unobstructed', () => {
    const pos = positionWith(
      [['e1', 'K'], ['a1', 'R'], ['h1', 'R'], ['e8', 'k']],
      { castling: CASTLE_WK | CASTLE_WQ },
    )
    const tos = legalMoves(pos).filter(m => algebraic(m.from) === 'e1').map(m => algebraic(m.to)).sort()
    expect(tos).toContain('c1')
    expect(tos).toContain('g1')
    expect(tos).toEqual(['c1', 'd1', 'd2', 'e2', 'f1', 'f2', 'g1'])
  })

  it('Black castles both sides from its home rank', () => {
    const pos = positionWith(
      [['e8', 'k'], ['a8', 'r'], ['h8', 'r'], ['e1', 'K']],
      { turn: 'b', castling: CASTLE_BK | CASTLE_BQ },
    )
    const tos = legalMoves(pos).filter(m => algebraic(m.from) === 'e8').map(m => algebraic(m.to)).sort()
    expect(tos).toContain('c8')
    expect(tos).toContain('g8')
  })

  it('castling is rejected when passing through an attacked square', () => {
    // Black rook on f8 attacks f1: kingside must be rejected, queenside (via d1/c1) is fine.
    const through = positionWith(
      [['e1', 'K'], ['a1', 'R'], ['h1', 'R'], ['f8', 'r'], ['e8', 'k']],
      { castling: CASTLE_WK | CASTLE_WQ },
    )
    const tos = legalMoves(through).filter(m => algebraic(m.from) === 'e1').map(m => algebraic(m.to)).sort()
    expect(tos).not.toContain('g1')
    expect(tos).toContain('c1')
    // Rook on e-file (e7) keeps the king in check: no castling at all.
    const checked = positionWith(
      [['e1', 'K'], ['a1', 'R'], ['h1', 'R'], ['e7', 'r'], ['e8', 'k']],
      { castling: CASTLE_WK | CASTLE_WQ },
    )
    expect(legalMoves(checked).some(m => m.castle !== '')).toBe(false)
  })

  it('castling rights lapse after the king or a rook moves', () => {
    const pos = positionWith(
      [['e1', 'K'], ['h1', 'R'], ['e8', 'k']],
      { castling: CASTLE_WK | CASTLE_WQ },
    )
    const ke2 = legalMoves(pos).find(m => algebraic(m.from) === 'e1' && algebraic(m.to) === 'e2')!
    const next = applyMove(pos, ke2)
    expect(next.castling & CASTLE_WK).toBe(0)
    expect(next.castling & CASTLE_WQ).toBe(0)
  })
})

describe('chess check and game end', () => {
  it('detects the king in check', () => {
    const pos = positionWith([['e1', 'K'], ['e8', 'k'], ['e7', 'r']])
    expect(inCheck(pos)).toBe(true)
  })

  it('a pinned piece may not move (legal filter excludes exposing the king)', () => {
    const pos = positionWith([['e1', 'K'], ['c3', 'N'], ['b4', 'b'], ['e8', 'k']])
    expect(fromSquares(pos)).not.toContain('c3')
  })

  it('fool\'s mate is checkmate for Black\'s queen', () => {
    const pos = positionWith([
      ['e1', 'K'], ['d1', 'Q'], ['d2', 'P'], ['e2', 'P'], ['f1', 'B'], ['f3', 'P'], ['g4', 'P'],
      ['e8', 'k'], ['d8', 'q'],
    ], { turn: 'b' })
    const qh4 = legalMoves(pos).find(m => algebraic(m.from) === 'd8' && algebraic(m.to) === 'h4')!
    const st = status(applyMove(pos, qh4))
    expect(st).toEqual({ kind: 'checkmate', winner: 'b' })
  })

  it('back-rank rook mate is checkmate', () => {
    const pos = positionWith([
      ['g1', 'K'], ['a1', 'R'], ['f2', 'P'], ['g2', 'P'], ['h2', 'P'],
      ['g8', 'k'], ['f7', 'p'], ['g7', 'p'], ['h7', 'p'],
    ])
    const ra8 = legalMoves(pos).find(m => algebraic(m.from) === 'a1' && algebraic(m.to) === 'a8')!
    expect(status(applyMove(pos, ra8))).toEqual({ kind: 'checkmate', winner: 'w' })
  })

  it('stalemate: not in check but no legal move', () => {
    const pos = positionWith([['h8', 'k'], ['f7', 'K'], ['g6', 'P']], { turn: 'b' })
    expect(inCheck(pos)).toBe(false)
    expect(status(pos)).toEqual({ kind: 'stalemate' })
  })

  it('insufficient material: K vs K and K+N vs K draw; two knights do not', () => {
    expect(insufficientMaterial(positionWith([['a1', 'K'], ['h8', 'k']]))).toBe(true)
    expect(insufficientMaterial(positionWith([['a1', 'K'], ['f3', 'N'], ['h8', 'k']]))).toBe(true)
    expect(insufficientMaterial(positionWith([['a1', 'K'], ['f3', 'B'], ['h8', 'k']]))).toBe(true)
    expect(insufficientMaterial(positionWith([['a1', 'K'], ['f3', 'N'], ['g3', 'N'], ['h8', 'k']]))).toBe(false)
  })

  it('threefold repetition by position-key counting is a draw', () => {
    const pos = positionWith([['a1', 'K'], ['e4', 'P'], ['h8', 'k']])
    expect(status(pos, 3)).toEqual({ kind: 'draw-repetition' })
    expect(status(pos, 2)).toEqual({ kind: 'playing' })
    // The key tracks the full state: same placement, different turn is distinct.
    const flipped = positionWith([['a1', 'K'], ['h8', 'k']], { turn: 'b' })
    expect(positionKey(pos)).not.toBe(positionKey(flipped))
  })
})

describe('chess ai', () => {
  it('finds mate in one at depth 2 (back-rank rook)', () => {
    const pos = positionWith([
      ['g1', 'K'], ['a1', 'R'], ['f2', 'P'], ['g2', 'P'], ['h2', 'P'],
      ['g8', 'k'], ['f7', 'p'], ['g7', 'p'], ['h7', 'p'],
    ])
    const res = chooseMove(pos, 2, 50_000, 1)
    expect(res.move).not.toBeNull()
    expect(algebraic(res.move!.to)).toBe('a8')
    expect(status(applyMove(pos, res.move!))).toEqual({ kind: 'checkmate', winner: 'w' })
  })

  it('takes a free bishop with the rook', () => {
    const pos = positionWith([['g1', 'K'], ['a1', 'R'], ['a5', 'b'], ['e8', 'k']])
    const res = chooseMove(pos, 3, 50_000, 2)
    expect(algebraic(res.move!.from)).toBe('a1')
    expect(algebraic(res.move!.to)).toBe('a5')
  })

  it('does not hang the queen for a defended pawn at L3 depth', () => {
    // Qd4 may grab the e5 pawn, but f6 recaptures: 100 - 900. Depth 4 sees it.
    const pos = positionWith([['g1', 'K'], ['d4', 'Q'], ['g8', 'k'], ['e5', 'p'], ['f6', 'p'], ['h7', 'p']])
    const res = chooseMove(pos, 4, 50_000, 3)
    expect(algebraic(res.move!.to)).not.toBe('e5')
  })

  it('respects the node budget', () => {
    const res = chooseMove(createStartPosition(), 5, 400, 4)
    expect(res.nodes).toBeLessThanOrEqual(400 + 64)
    expect(res.move).not.toBeNull()
  })

  it('is deterministic: same seed and budget pick the same move', () => {
    const pos = positionWith([['g1', 'K'], ['d4', 'Q'], ['g8', 'k'], ['e5', 'p'], ['f6', 'p'], ['h7', 'p']])
    const a = chooseMove(pos, 3, 50_000, 7)
    const b = chooseMove(pos, 3, 50_000, 7)
    expect(algebraic(a.move!.from) + algebraic(a.move!.to)).toBe(algebraic(b.move!.from) + algebraic(b.move!.to))
  })

  it('mulberry32 is a stable seeded rng', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })

  it('evaluate is material-sane: up a queen means a big positive score', () => {
    const even = positionWith([['g1', 'K'], ['g8', 'k']])
    expect(evaluate(even)).toBe(0)
    const up = positionWith([['g1', 'K'], ['d8', 'Q'], ['g8', 'k']])
    expect(evaluate(up)).toBeGreaterThan(800)
  })

  it('plays 10 deterministic plies from the start (L2 Black vs L1 White)', () => {
    const run = (): string[] => {
      let pos = createStartPosition()
      const keys: string[] = []
      for (let i = 0; i < 10; i += 1) {
        const depth = pos.turn === 'b' ? 3 : 2 // L2 plays Black, L1 plays White
        const res = chooseMove(pos, depth, 20_000, 0xabcd + i)
        if (res.move === null) break
        pos = applyMove(pos, res.move)
        keys.push(positionKey(pos))
      }
      return keys
    }
    const first = run()
    expect(first).toHaveLength(10)
    expect(new Set(first).size).toBe(10)
    expect(run()).toEqual(first)
    // Reconstruct the final position and confirm the game is still going.
    let pos = createStartPosition()
    for (let i = 0; i < 10; i += 1) {
      const depth = pos.turn === 'b' ? 3 : 2
      pos = applyMove(pos, chooseMove(pos, depth, 20_000, 0xabcd + i).move!)
    }
    expect(status(pos, 1).kind).toBe('playing')
  }, 20_000)
})
