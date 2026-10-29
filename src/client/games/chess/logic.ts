/**
 * Chess pure rules on a 0x88 board (index = rank * 16 + file; rank 0 is
 * White's first rank, so a1 = 0, h1 = 7, a8 = 0x70). Pieces are single chars:
 * uppercase White ('PNBRQK'), lowercase Black ('pnbrqk'), '' empty. All
 * functions are pure — applyMove returns a fresh Position, never mutates.
 */

/** White pieces are uppercase, Black lowercase. */
export type Piece = 'P' | 'N' | 'B' | 'R' | 'Q' | 'K' | 'p' | 'n' | 'b' | 'r' | 'q' | 'k'
export type Color = 'w' | 'b'

/** Castling-rights bits: White king/queen side, Black king/queen side. */
export const CASTLE_WK = 1
export const CASTLE_WQ = 2
export const CASTLE_BK = 4
export const CASTLE_BQ = 8

/** The full game state; board is a 128-slot array (0x88 layout, junk slots ''). */
export interface Position {
  board: (Piece | '')[]
  turn: Color
  /** Castling-rights bitmask (CASTLE_* constants). */
  castling: number
  /** En-passant target square (0x88) or -1. */
  ep: number
  /** Halfmove clock (50-move rule); reset on pawn moves and captures. */
  halfmove: number
}

export interface Move {
  from: number
  to: number
  piece: Piece
  /** Piece standing on the target square ('' when none); the pawn for en passant. */
  capture: Piece | ''
  /** Promotion piece type ('' when not a promotion). */
  promo: '' | 'q' | 'r' | 'b' | 'n'
  /** Castling side ('' when not castling). */
  castle: 'k' | 'q' | ''
  /** True for an en-passant capture. */
  enPassant: boolean
  /** True for a pawn double push (sets the next position's ep square). */
  double: boolean
}

/** True when `sq` is an on-board 0x88 index. */
export function onBoard(sq: number): boolean {
  return (sq & 0x88) === 0
}

export function fileOf(sq: number): number {
  return sq & 7
}

export function rankOf(sq: number): number {
  return sq >> 4
}

/** Parse 'a1'..'h8' into a 0x88 index. */
export function sq(name: string): number {
  const f = name.charCodeAt(0) - 97
  const r = Number(name[1]) - 1
  return r * 16 + f
}

/** Format a 0x88 index as 'a1'..'h8' (tests / debugging). */
export function algebraic(s: number): string {
  return `${String.fromCharCode(97 + fileOf(s))}${rankOf(s) + 1}`
}

export function colorOf(p: Piece): Color {
  return p === p.toUpperCase() ? 'w' : 'b'
}

export function other(c: Color): Color {
  return c === 'w' ? 'b' : 'w'
}

/** The standard starting position. */
export function createStartPosition(): Position {
  const board: (Piece | '')[] = new Array<Piece | ''>(128).fill('')
  const back = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'] as const
  for (let f = 0; f < 8; f += 1) {
    const backPiece = back[f]!
    board[f] = backPiece
    board[16 + f] = 'P'
    board[0x60 + f] = 'p'
    board[0x70 + f] = backPiece.toLowerCase() as Piece
  }
  return { board, turn: 'w', castling: CASTLE_WK | CASTLE_WQ | CASTLE_BK | CASTLE_BQ, ep: -1, halfmove: 0 }
}

/**
 * Build a sparse position for tests: entries place pieces by square name;
 * defaults give empty boards with the given turn/castling/ep.
 * @param entries - [squareName, piece] placements.
 * @param opts - turn (default 'w'), castling mask (default 0), ep square (default -1).
 */
export function positionWith(
  entries: [string, Piece][],
  opts: { turn?: Color; castling?: number; ep?: number } = {},
): Position {
  const pos = createEmptyPosition(opts.turn ?? 'w')
  pos.castling = opts.castling ?? 0
  pos.ep = opts.ep ?? -1
  for (const [name, p] of entries) pos.board[sq(name)] = p
  return pos
}

/** An empty board with the given side to move (setup base). */
export function createEmptyPosition(turn: Color = 'w'): Position {
  return { board: new Array<Piece | ''>(128).fill(''), turn, castling: 0, ep: -1, halfmove: 0 }
}

const KNIGHT_DIRS = [-33, -31, -18, -14, 14, 18, 31, 33] as const
const KING_DIRS = [-17, -16, -15, -1, 1, 15, 16, 17] as const
const BISHOP_DIRS = [-17, -15, 15, 17] as const
const ROOK_DIRS = [-16, -1, 1, 16] as const

/**
 * Whether `by` attacks `target` on this board (pawn diagonals, knights,
 * adjacency, and sliding bishops/rooks/queens).
 */
export function isSquareAttacked(board: (Piece | '')[], target: number, by: Color): boolean {
  // Pawns: a White pawn on s attacks s+15/s+17, so `target` is attacked by a
  // White pawn sitting at target-15 or target-17.
  const pawn = by === 'w' ? 'P' : 'p'
  for (const d of by === 'w' ? [-15, -17] : [15, 17]) {
    const s = target + d
    if (onBoard(s) && board[s] === pawn) return true
  }
  const knight = by === 'w' ? 'N' : 'n'
  for (const d of KNIGHT_DIRS) {
    const s = target + d
    if (onBoard(s) && board[s] === knight) return true
  }
  const king = by === 'w' ? 'K' : 'k'
  for (const d of KING_DIRS) {
    const s = target + d
    if (onBoard(s) && board[s] === king) return true
  }
  const diag1 = by === 'w' ? 'B' : 'b'
  const diag2 = by === 'w' ? 'Q' : 'q'
  for (const d of BISHOP_DIRS) {
    let s = target + d
    while (onBoard(s)) {
      const p = board[s]
      if (p !== '') {
        if (p === diag1 || p === diag2) return true
        break
      }
      s += d
    }
  }
  const ortho1 = by === 'w' ? 'R' : 'r'
  const ortho2 = by === 'w' ? 'Q' : 'q'
  for (const d of ROOK_DIRS) {
    let s = target + d
    while (onBoard(s)) {
      const p = board[s]
      if (p !== '') {
        if (p === ortho1 || p === ortho2) return true
        break
      }
      s += d
    }
  }
  return false
}

/** 0x88 index of `color`'s king, or -1 (should not happen in legal games). */
export function findKing(board: (Piece | '')[], color: Color): number {
  const k = color === 'w' ? 'K' : 'k'
  for (let s = 0; s < 128; s += 1) {
    if ((s & 0x88) === 0 && board[s] === k) return s
  }
  return -1
}

/** Whether the side to move is in check. */
export function inCheck(pos: Position): boolean {
  const k = findKing(pos.board, pos.turn)
  return k >= 0 && isSquareAttacked(pos.board, k, other(pos.turn))
}

/** All pseudo-legal moves for the side to move (castling is fully checked here). */
export function generatePseudoMoves(pos: Position): Move[] {
  const moves: Move[] = []
  const me = pos.turn
  const opp = other(me)
  const push = (m: Move): void => { moves.push(m) }
  for (let from = 0; from < 128; from += 1) {
    if ((from & 0x88) !== 0) continue
    const p = pos.board[from] as Piece | ''
    if (p === '' || colorOf(p) !== me) continue
    const upper = p.toUpperCase()
    if (upper === 'P') {
      const dir = me === 'w' ? 16 : -16
      const startRank = me === 'w' ? 1 : 6
      const promoRank = me === 'w' ? 7 : 0
      const one = from + dir
      if (onBoard(one) && pos.board[one] === '') {
        emitPawn(push, pos, from, one, '', promoRank)
        const two = one + dir
        if (rankOf(from) === startRank && pos.board[two] === '') {
          push({ from, to: two, piece: p, capture: '', promo: '', castle: '', enPassant: false, double: true })
        }
      }
      for (const dd of me === 'w' ? [15, 17] : [-15, -17]) {
        const to = from + dd
        if (!onBoard(to)) continue
        const t = pos.board[to] as Piece | ''
        if (t !== '' && colorOf(t) === opp) emitPawn(push, pos, from, to, t, promoRank)
        else if (t === '' && to === pos.ep) {
          push({ from, to, piece: p, capture: me === 'w' ? 'p' : 'P', promo: '', castle: '', enPassant: true, double: false })
        }
      }
    } else if (upper === 'N' || upper === 'K') {
      const dirs = upper === 'N' ? KNIGHT_DIRS : KING_DIRS
      for (const d of dirs) {
        const to = from + d
        if (!onBoard(to)) continue
        const t = pos.board[to] as Piece | ''
        if (t !== '' && colorOf(t) === me) continue
        push({ from, to, piece: p, capture: t, promo: '', castle: '', enPassant: false, double: false })
      }
    } else {
      const dirs = upper === 'B' ? BISHOP_DIRS : upper === 'R' ? ROOK_DIRS : [...BISHOP_DIRS, ...ROOK_DIRS]
      for (const d of dirs) {
        let to = from + d
        while (onBoard(to)) {
          const t = pos.board[to] as Piece | ''
          if (t !== '' && colorOf(t) === me) break
          push({ from, to, piece: p, capture: t, promo: '', castle: '', enPassant: false, double: false })
          if (t !== '') break
          to += d
        }
      }
    }
  }
  emitCastling(push, pos)
  return moves
}

function emitPawn(
  push: (m: Move) => void, pos: Position, from: number, to: number, capture: Piece | '', promoRank: number,
): void {
  const piece = pos.board[from] as Piece
  if (rankOf(to) === promoRank) {
    for (const promo of ['q', 'r', 'b', 'n'] as const) {
      push({ from, to, piece, capture, promo, castle: '', enPassant: false, double: false })
    }
  } else {
    push({ from, to, piece, capture, promo: '', castle: '', enPassant: false, double: false })
  }
}

/** Castling moves with the full through-check rule (not out of, through, or into check). */
function emitCastling(push: (m: Move) => void, pos: Position): void {
  const board = pos.board
  const white = pos.turn === 'w'
  const kingFrom = white ? 4 : 0x74
  const opp: Color = white ? 'b' : 'w'
  const king = white ? 'K' : 'k'
  const rook = white ? 'R' : 'r'
  if (board[kingFrom] !== king) return
  if (isSquareAttacked(board, kingFrom, opp)) return
  const ks = white ? CASTLE_WK : CASTLE_BK
  const qs = white ? CASTLE_WQ : CASTLE_BQ
  const base = white ? 0 : 0x70
  if ((pos.castling & ks) !== 0 && board[base + 5] === '' && board[base + 6] === '' && board[base + 7] === rook
    && !isSquareAttacked(board, base + 5, opp) && !isSquareAttacked(board, base + 6, opp)) {
    push({ from: kingFrom, to: base + 6, piece: king, capture: '', promo: '', castle: 'k', enPassant: false, double: false })
  }
  if ((pos.castling & qs) !== 0 && board[base + 1] === '' && board[base + 2] === '' && board[base + 3] === ''
    && board[base] === rook && !isSquareAttacked(board, base + 3, opp) && !isSquareAttacked(board, base + 2, opp)) {
    push({ from: kingFrom, to: base + 2, piece: king, capture: '', promo: '', castle: 'q', enPassant: false, double: false })
  }
}

/**
 * Apply a pseudo-legal move, returning the next position (pure). Castling
 * rights, ep square, and the halfmove clock are updated.
 */
export function applyMove(pos: Position, m: Move): Position {
  const board = pos.board.slice()
  const me = pos.turn
  board[m.from] = ''
  if (m.enPassant) board[m.to + (me === 'w' ? -16 : 16)] = ''
  if (m.promo !== '') board[m.to] = (me === 'w' ? m.promo.toUpperCase() : m.promo) as Piece
  else board[m.to] = m.piece
  if (m.castle === 'k') {
    const base = me === 'w' ? 0 : 0x70
    board[base + 7] = ''
    board[base + 5] = me === 'w' ? 'R' : 'r'
  } else if (m.castle === 'q') {
    const base = me === 'w' ? 0 : 0x70
    board[base] = ''
    board[base + 3] = me === 'w' ? 'R' : 'r'
  }
  let castling = pos.castling
  if (m.piece === 'K') castling &= ~(CASTLE_WK | CASTLE_WQ)
  if (m.piece === 'k') castling &= ~(CASTLE_BK | CASTLE_BQ)
  // Rook moved or captured off its home corner: drop that right.
  for (const corner of [0, 7, 0x70, 0x77]) {
    if (m.from === corner || m.to === corner) {
      if (corner === 0) castling &= ~CASTLE_WQ
      else if (corner === 7) castling &= ~CASTLE_WK
      else if (corner === 0x70) castling &= ~CASTLE_BQ
      else castling &= ~CASTLE_BK
    }
  }
  const pawnMove = m.piece === 'P' || m.piece === 'p'
  return {
    board,
    turn: other(me),
    castling,
    ep: m.double ? (m.from + m.to) / 2 : -1,
    halfmove: pawnMove || m.capture !== '' ? 0 : pos.halfmove + 1,
  }
}

/** Fully legal moves: pseudo moves that leave the mover's king unattacked. */
export function legalMoves(pos: Position): Move[] {
  const me = pos.turn
  const opp = other(me)
  return generatePseudoMoves(pos).filter(m => {
    const next = applyMove(pos, m)
    const k = findKing(next.board, me)
    return k < 0 || !isSquareAttacked(next.board, k, opp)
  })
}

/** FEN-ish position key (placement, turn, castling, ep) for repetition counting. */
export function positionKey(pos: Position): string {
  let s = ''
  for (let r = 7; r >= 0; r -= 1) {
    for (let f = 0; f < 8; f += 1) {
      const p = pos.board[r * 16 + f]
      s += p === '' ? '.' : p
    }
  }
  return `${s} ${pos.turn} ${pos.castling} ${pos.ep}`
}

/**
 * Draw by bare kings or a single bishop/knight (K vs K, K+B/N vs K).
 * Everything else (including two minors) plays on.
 */
export function insufficientMaterial(pos: Position): boolean {
  const rest: Piece[] = []
  for (let s = 0; s < 128; s += 1) {
    if ((s & 0x88) !== 0) continue
    const p = pos.board[s] as Piece | ''
    if (p === '' || p === 'K' || p === 'k') continue
    rest.push(p)
  }
  if (rest.length === 0) return true
  if (rest.length === 1) {
    const u = rest[0]!.toUpperCase()
    return u === 'B' || u === 'N'
  }
  return false
}

export type Status =
  | { kind: 'playing' }
  | { kind: 'checkmate'; winner: Color }
  | { kind: 'stalemate' }
  | { kind: 'draw-insufficient' }
  | { kind: 'draw-repetition' }

/**
 * Game status for the side to move.
 * @param pos - the position to judge.
 * @param repetitions - how many times the current position (by positionKey)
 *   has occurred, including this one; ≥ 3 is a draw.
 */
export function status(pos: Position, repetitions = 1): Status {
  if (insufficientMaterial(pos)) return { kind: 'draw-insufficient' }
  if (repetitions >= 3) return { kind: 'draw-repetition' }
  if (legalMoves(pos).length === 0) {
    return inCheck(pos) ? { kind: 'checkmate', winner: other(pos.turn) } : { kind: 'stalemate' }
  }
  return { kind: 'playing' }
}
