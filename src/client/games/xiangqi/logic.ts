/**
 * 中国象棋纯规则引擎：9x10 交叉点棋盘（索引 = row * 9 + col；row 0 为黑方底线
 * 在上，row 9 为红方底线在下，红方向 row 减小方向前进）。棋子用单字符表示：
 * 大写为红方（K 帅 A 仕 E 相 H 傌/马 R 俥/车 C 炮 P 兵），小写为黑方
 * （k 将 a 士 e 象 h 马 r 车 c 砲 p 卒）。所有函数均为纯函数：applyMove
 * 返回新的 Position，绝不改动传入状态。
 */

/** 红方 'r'，黑方 'b'。 */
export type Side = 'r' | 'b'

/** 棋子：大写红方，小写黑方；空点为 ''。 */
export type Piece =
  | 'K' | 'A' | 'E' | 'H' | 'R' | 'C' | 'P'
  | 'k' | 'a' | 'e' | 'h' | 'r' | 'c' | 'p'

/** 完整局面：90 格棋盘 + 行棋方。 */
export interface Position {
  board: (Piece | '')[]
  turn: Side
}

/**
 * 着法代数：[fromRow, fromCol, toRow, toCol]。
 * 棋子与被吃子由棋盘现场推导，不冗余存储。
 */
export type Move = readonly [number, number, number, number]

/** 棋盘行数（上下方向）。 */
export const ROWS = 10
/** 棋盘列数（左右方向）。 */
export const COLS = 9

/** 行列转一维索引。 */
export function idx(row: number, col: number): number {
  return row * COLS + col
}

/** 索引取行号。 */
export function rowOf(i: number): number {
  return Math.floor(i / COLS)
}

/** 索引取列号。 */
export function colOf(i: number): number {
  return i % COLS
}

/** 是否在 9x10 棋盘内。 */
export function inBoard(row: number, col: number): boolean {
  return row >= 0 && row < ROWS && col >= 0 && col < COLS
}

/** 棋子属于哪一方。 */
export function colorOf(p: Piece): Side {
  return p === p.toUpperCase() ? 'r' : 'b'
}

/** 对方行棋方。 */
export function other(s: Side): Side {
  return s === 'r' ? 'b' : 'r'
}

/** 是否在 side 的九宫内（红 rows 7-9 / 黑 rows 0-2，cols 3-5）。 */
export function inPalace(row: number, col: number, side: Side): boolean {
  if (col < 3 || col > 5) return false
  return side === 'r' ? row >= 7 && row <= 9 : row >= 0 && row <= 2
}

/** side 的兵是否已过河（红 r<=4，黑 r>=5）。 */
function crossedRiver(row: number, side: Side): boolean {
  return side === 'r' ? row <= 4 : row >= 5
}

/** 标准开局：黑上红下，红先行。 */
export function createStartPosition(): Position {
  const board: (Piece | '')[] = new Array<Piece | ''>(ROWS * COLS).fill('')
  const backBlack: Piece[] = ['r', 'h', 'e', 'a', 'k', 'a', 'e', 'h', 'r']
  const backRed: Piece[] = ['R', 'H', 'E', 'A', 'K', 'A', 'E', 'H', 'R']
  for (let c = 0; c < COLS; c += 1) {
    board[idx(0, c)] = backBlack[c]!
    board[idx(9, c)] = backRed[c]!
  }
  board[idx(2, 1)] = 'c'
  board[idx(2, 7)] = 'c'
  board[idx(7, 1)] = 'C'
  board[idx(7, 7)] = 'C'
  for (const c of [0, 2, 4, 6, 8]) {
    board[idx(3, c)] = 'p'
    board[idx(6, c)] = 'P'
  }
  return { board, turn: 'r' }
}

/** 空棋盘（测试构造基底）。 */
export function createEmptyPosition(turn: Side = 'r'): Position {
  return { board: new Array<Piece | ''>(ROWS * COLS).fill(''), turn }
}

/**
 * 测试用稀疏局面构造器：entries 按 [row, col, piece] 放子。
 * @param entries - 棋子摆放列表。
 * @param opts - 行棋方（默认红）。
 * @returns 填好的局面。
 */
export function positionWith(
  entries: Array<[number, number, Piece]>,
  opts: { turn?: Side } = {},
): Position {
  const pos = createEmptyPosition(opts.turn ?? 'r')
  for (const [row, col, p] of entries) pos.board[idx(row, col)] = p
  return pos
}

/** 找 side 的将/帅，返回索引，找不到为 -1（合法对局不会发生）。 */
export function findKing(board: (Piece | '')[], side: Side): number {
  const k = side === 'r' ? 'K' : 'k'
  for (let i = 0; i < ROWS * COLS; i += 1) {
    if (board[i] === k) return i
  }
  return -1
}

const ORTHO: ReadonlyArray<readonly [number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]]
const HORSE: ReadonlyArray<readonly [number, number]> = [
  [-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1],
]
const DIAG1: ReadonlyArray<readonly [number, number]> = [[-1, -1], [-1, 1], [1, -1], [1, 1]]
const ELEPHANT: ReadonlyArray<readonly [number, number]> = [[-2, -2], [-2, 2], [2, -2], [2, 2]]

/**
 * 将帅是否对脸：同列且中间无子。任何一方走出对脸局面均为违规。
 * @param board - 棋盘。
 * @returns 对脸返回 true。
 */
export function kingsFacing(board: (Piece | '')[]): boolean {
  const rk = findKing(board, 'r')
  const bk = findKing(board, 'b')
  if (rk < 0 || bk < 0) return false
  if (colOf(rk) !== colOf(bk)) return false
  const c = colOf(rk)
  for (let row = rowOf(bk) + 1; row < rowOf(rk); row += 1) {
    if (board[idx(row, c)] !== '') return false
  }
  return true
}

/**
 * (row, col) 是否被 by 方攻击（判将用，只对将/帅所在点调用）。
 * 覆盖：车直线、炮隔一子、马（含蹩腿）、兵前进与过河横吃、
 * 将帅照面（沿 open file 视作攻击，等价于对脸判负约束）。
 * @param board - 棋盘。
 * @param row - 目标行。
 * @param col - 目标列。
 * @param by - 攻击方。
 * @returns 被攻击返回 true。
 */
export function isSquareAttacked(board: (Piece | '')[], row: number, col: number, by: Side): boolean {
  // 直线方向：第一个子若是 by 的车（或将帅照面），或第二个子是 by 的炮。
  for (const [dr, dc] of ORTHO) {
    let r = row + dr
    let c = col + dc
    let screen: Piece | '' | null = null
    while (inBoard(r, c)) {
      const p = board[idx(r, c)] as Piece | ''
      if (p !== '') {
        if (screen === null) {
          if (colorOf(p) === by) {
            const u = p.toUpperCase()
            // 将帅照面：竖直方向上第一个子是对方将帅即构成攻击（目标必为将帅）。
            if (u === 'R' || u === 'K') return true
          }
          screen = p
        } else {
          if (colorOf(p) === by && p.toUpperCase() === 'C') return true
          break
        }
      }
      r += dr
      c += dc
    }
  }
  // 马：反向找马位，并检查马腿（马位相邻直行一格）。
  const horse = by === 'r' ? 'H' : 'h'
  for (const [dr, dc] of HORSE) {
    const hr = row - dr
    const hc = col - dc
    if (!inBoard(hr, hc) || board[idx(hr, hc)] !== horse) continue
    // 马从 (hr,hc) 走 (dr,dc)：|dr| 为 2 时腿在竖向邻格，否则在横向邻格。
    const lr = Math.abs(dr) === 2 ? hr + dr / 2 : hr
    const lc = Math.abs(dr) === 2 ? hc : hc + dc / 2
    if (board[idx(lr, lc)] === '') return true
  }
  // 兵：by 方兵在目标"后方"一格即直吃；过河兵可从侧面横吃。
  const pawn = by === 'r' ? 'P' : 'p'
  const fr = row - (by === 'r' ? -1 : 1)
  if (inBoard(fr, col) && board[idx(fr, col)] === pawn) return true
  for (const dc of [-1, 1]) {
    const c2 = col + dc
    if (!inBoard(row, c2)) continue
    if (board[idx(row, c2)] === pawn && crossedRiver(row, by)) return true
  }
  return false
}

/** 当前行棋方是否被将军。 */
export function inCheck(pos: Position): boolean {
  const k = findKing(pos.board, pos.turn)
  if (k < 0) return false
  return isSquareAttacked(pos.board, rowOf(k), colOf(k), other(pos.turn))
}

function pieceAt(board: (Piece | '')[], row: number, col: number): Piece | '' {
  return board[idx(row, col)] as Piece | ''
}

/**
 * 生成行棋方的全部伪合法着法（未过滤送将/对脸）。
 * 规则完整覆盖：车滑行、马蹩腿、炮隔子吃、象塞眼不过河、
 * 士斜行不出宫、将直行不出宫、兵过河横走不后退。
 * @param pos - 当前局面。
 * @returns 伪合法着法数组。
 */
export function generateMoves(pos: Position): Move[] {
  const moves: Move[] = []
  const board = pos.board
  const me = pos.turn
  const opp = other(me)
  const push = (fr: number, fc: number, tr: number, tc: number): void => {
    moves.push([fr, fc, tr, tc])
  }
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const p = pieceAt(board, row, col)
      if (p === '' || colorOf(p) !== me) continue
      const u = p.toUpperCase()
      if (u === 'R') {
        // 车：四方向滑行，遇子即止（敌子可吃）。
        for (const [dr, dc] of ORTHO) {
          let r = row + dr
          let c = col + dc
          while (inBoard(r, c)) {
            const t = pieceAt(board, r, c)
            if (t !== '' && colorOf(t) === me) break
            push(row, col, r, c)
            if (t !== '') break
            r += dr
            c += dc
          }
        }
      } else if (u === 'H') {
        // 马：日字，蹩马腿（|dr| 为 2 腿在竖邻格，否则在横邻格）。
        for (const [dr, dc] of HORSE) {
          const r = row + dr
          const c = col + dc
          if (!inBoard(r, c)) continue
          const t = pieceAt(board, r, c)
          if (t !== '' && colorOf(t) === me) continue
          const lr = Math.abs(dr) === 2 ? row + dr / 2 : row
          const lc = Math.abs(dr) === 2 ? col : col + dc / 2
          if (pieceAt(board, lr, lc) !== '') continue
          push(row, col, r, c)
        }
      } else if (u === 'C') {
        // 炮：不吃时如车滑行；吃必须恰好隔一个炮架。
        for (const [dr, dc] of ORTHO) {
          let r = row + dr
          let c = col + dc
          let screen = false
          while (inBoard(r, c)) {
            const t = pieceAt(board, r, c)
            if (!screen) {
              if (t === '') push(row, col, r, c)
              else screen = true
            } else if (t !== '') {
              if (colorOf(t) === opp) push(row, col, r, c)
              break
            }
            r += dr
            c += dc
          }
        }
      } else if (u === 'E') {
        // 相/象：田字，塞象眼，不过河。
        for (const [dr, dc] of ELEPHANT) {
          const r = row + dr
          const c = col + dc
          if (!inBoard(r, c)) continue
          if (crossedRiver(r, me)) continue
          const t = pieceAt(board, r, c)
          if (t !== '' && colorOf(t) === me) continue
          if (pieceAt(board, row + dr / 2, col + dc / 2) !== '') continue
          push(row, col, r, c)
        }
      } else if (u === 'A') {
        // 士：斜一格，不出九宫。
        for (const [dr, dc] of DIAG1) {
          const r = row + dr
          const c = col + dc
          if (!inBoard(r, c) || !inPalace(r, c, me)) continue
          const t = pieceAt(board, r, c)
          if (t !== '' && colorOf(t) === me) continue
          push(row, col, r, c)
        }
      } else if (u === 'K') {
        // 将/帅：直一格，不出九宫。
        for (const [dr, dc] of ORTHO) {
          const r = row + dr
          const c = col + dc
          if (!inBoard(r, c) || !inPalace(r, c, me)) continue
          const t = pieceAt(board, r, c)
          if (t !== '' && colorOf(t) === me) continue
          push(row, col, r, c)
        }
      } else {
        // 兵/卒：未过河只前进；过河可横走；永不后退。
        const fr = row + (me === 'r' ? -1 : 1)
        if (inBoard(fr, col)) {
          const t = pieceAt(board, fr, col)
          if (t === '' || colorOf(t) === opp) push(row, col, fr, col)
        }
        if (crossedRiver(row, me)) {
          for (const dc of [-1, 1]) {
            const c = col + dc
            if (!inBoard(row, c)) continue
            const t = pieceAt(board, row, c)
            if (t === '' || colorOf(t) === opp) push(row, col, row, c)
          }
        }
      }
    }
  }
  return moves
}

/**
 * 应用着法，返回新局面（纯函数，翻转行棋方）。
 * @param pos - 当前局面。
 * @param m - 着法。
 * @returns 走完后的新局面。
 */
export function applyMove(pos: Position, m: Move): Position {
  const board = pos.board.slice()
  const [fr, fc, tr, tc] = m
  board[idx(tr, tc)] = board[idx(fr, fc)]!
  board[idx(fr, fc)] = ''
  return { board, turn: other(pos.turn) }
}

/**
 * 完全合法着法：伪合法着法中，走完己方不被将军且将帅不对脸的着法。
 * @param pos - 当前局面。
 * @returns 合法着法数组。
 */
export function legalMoves(pos: Position): Move[] {
  const me = pos.turn
  const opp = other(me)
  const board = pos.board
  const result: Move[] = []
  for (const m of generateMoves(pos)) {
    const [fr, fc, tr, tc] = m
    // 原地试走再还原，避免整盘拷贝。
    const moving = board[idx(fr, fc)]!
    const captured = board[idx(tr, tc)] as Piece | ''
    board[idx(tr, tc)] = moving
    board[idx(fr, fc)] = ''
    let ok = false
    if (!kingsFacing(board)) {
      const k = findKing(board, me)
      ok = k < 0 || !isSquareAttacked(board, rowOf(k), colOf(k), opp)
    }
    board[idx(fr, fc)] = moving
    board[idx(tr, tc)] = captured
    if (ok) result.push(m)
  }
  return result
}

/** 局面键（90 格摆放 + 行棋方），用于循环/重复检测。 */
export function positionKey(pos: Position): string {
  let s = ''
  for (let i = 0; i < ROWS * COLS; i += 1) s += pos.board[i] === '' ? '.' : pos.board[i]
  return s + ' ' + pos.turn
}

export type Status =
  | { kind: 'playing' }
  | { kind: 'checkmate'; winner: Side }
  | { kind: 'stalemate'; winner: Side }
  | { kind: 'draw-repetition' }

/**
 * 对局状态判定。中国象棋规则：无合法着法即判负 —— 被将军为将死（checkmate），
 * 未被将军为困毙（stalemate），两者赢家均为对方；长将判负在此简化为
 * 三次重复局面判和（repetitions >= 3）。
 * @param pos - 待判定局面。
 * @param repetitions - 当前局面（含本次）已出现的次数，默认 1。
 * @returns 对局状态。
 */
export function status(pos: Position, repetitions = 1): Status {
  if (repetitions >= 3) return { kind: 'draw-repetition' }
  if (legalMoves(pos).length === 0) {
    return inCheck(pos)
      ? { kind: 'checkmate', winner: other(pos.turn) }
      : { kind: 'stalemate', winner: other(pos.turn) }
  }
  return { kind: 'playing' }
}
