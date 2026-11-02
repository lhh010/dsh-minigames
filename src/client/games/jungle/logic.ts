/**
 * 斗兽棋（Jungle）纯规则引擎：7 列 x 9 行方格棋盘（索引 = row * 7 + col；
 * row 0 为黑方底线在上，row 8 为红方底线在下，红方向 row 增大方向前进）。
 * 棋子用单字符表示：大写为红方（E 象 L 狮 T 虎 P 豹 W 狼 D 狗 C 猫 M 鼠），
 * 小写为黑方。等级 1-8：鼠 1 猫 2 狗 3 狼 4 豹 5 虎 6 狮 7 象 8；
 * 高级或同级可吃低级，鼠可吃象而象不可吃鼠。地形：双方各一个兽穴与
 * 三个陷阱；中央两块 2x3 河流（rows 3-5，cols 1/2 与 4/5）——仅鼠可
 * 入水，狮虎可沿直线跳河，但途中任一水格有鼠（无论哪方）即被截断。
 * 所有函数均为纯函数：applyMove 返回新 Position，绝不改动传入状态。
 */

/** 红方 'r'，黑方 'b'。 */
export type Side = 'r' | 'b'

/** 棋子：大写红方，小写黑方；空格为 ''。 */
export type Piece =
  | 'E' | 'L' | 'T' | 'P' | 'W' | 'D' | 'C' | 'M'
  | 'e' | 'l' | 't' | 'p' | 'w' | 'd' | 'c' | 'm'

/** 完整局面：63 格棋盘 + 行棋方。 */
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
export const ROWS = 9
/** 棋盘列数（左右方向）。 */
export const COLS = 7

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

/** 是否在 7x9 棋盘内。 */
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

/** 等级表：鼠 1、猫 2、狗 3、狼 4、豹 5、虎 6、狮 7、象 8。 */
export const RANK: Record<Piece, number> = {
  M: 1, C: 2, D: 3, W: 4, P: 5, T: 6, L: 7, E: 8,
  m: 1, c: 2, d: 3, w: 4, p: 5, t: 6, l: 7, e: 8,
}

/** 黑方兽穴（row 0 正中）。 */
export const BLACK_DEN = idx(0, 3)
/** 红方兽穴（row 8 正中）。 */
export const RED_DEN = idx(8, 3)
/** 黑方三陷阱（兽穴左、右、前一格）。 */
export const BLACK_TRAPS: readonly number[] = [idx(0, 2), idx(0, 4), idx(1, 3)]
/** 红方三陷阱（兽穴左、右、前一格）。 */
export const RED_TRAPS: readonly number[] = [idx(8, 2), idx(8, 4), idx(7, 3)]

/** 河流水格集合（rows 3-5 的 cols 1/2 与 4/5）。 */
const WATER: ReadonlySet<number> = new Set<number>(
  ((): number[] => {
    const cells: number[] = []
    for (const row of [3, 4, 5]) {
      for (const col of [1, 2, 4, 5]) cells.push(idx(row, col))
    }
    return cells
  })(),
)

/** 是否为河流格。 */
export function isWater(i: number): boolean {
  return WATER.has(i)
}

/** side 方兽穴的索引。 */
export function denOf(side: Side): number {
  return side === 'r' ? RED_DEN : BLACK_DEN
}

/** i 是否 side 方的陷阱格。 */
export function isTrapOf(side: Side, i: number): boolean {
  return side === 'r' ? RED_TRAPS.includes(i) : BLACK_TRAPS.includes(i)
}

/** 标准开局：黑上红下，红先行（与上方黑棋呈中心对称）。 */
export function createStartPosition(): Position {
  const board: (Piece | '')[] = new Array<Piece | ''>(ROWS * COLS).fill('')
  board[idx(0, 0)] = 'l'
  board[idx(0, 6)] = 't'
  board[idx(1, 1)] = 'd'
  board[idx(1, 5)] = 'c'
  board[idx(2, 0)] = 'm'
  board[idx(2, 2)] = 'p'
  board[idx(2, 4)] = 'w'
  board[idx(2, 6)] = 'e'
  board[idx(8, 6)] = 'L'
  board[idx(8, 0)] = 'T'
  board[idx(7, 5)] = 'D'
  board[idx(7, 1)] = 'C'
  board[idx(6, 6)] = 'M'
  board[idx(6, 4)] = 'P'
  board[idx(6, 2)] = 'W'
  board[idx(6, 0)] = 'E'
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

/**
 * 吃子判定（不含入水限制）。
 * 规则：攻方在水里不能吃岸上的子；守方站在攻方陷阱里可被任意吃；
 * 鼠吃象、象不吃鼠；其余按等级 >= 判定。
 * @param attacker - 攻方棋子。
 * @param defender - 守方棋子。
 * @param attackerInWater - 攻方是否在河中。
 * @param defenderOnLand - 守方是否在岸上。
 * @param defenderTrapped - 守方是否站在攻方陷阱里。
 * @returns 可吃返回 true。
 */
export function canCapture(
  attacker: Piece, defender: Piece,
  attackerInWater: boolean, defenderOnLand: boolean, defenderTrapped: boolean,
): boolean {
  if (attackerInWater && defenderOnLand) return false
  if (defenderTrapped) return true
  const a = RANK[attacker]
  const d = RANK[defender]
  if (a === 1 && d === 8) return true
  if (a === 8 && d === 1) return false
  return a >= d
}

const ORTHO: ReadonlyArray<readonly [number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]]

/**
 * 生成行棋方的全部合法着法。斗兽棋没有"将军"概念，伪合法即合法：
 * 每子四正交方向走一格；仅鼠可入水；狮虎（等级 >= 6）邻水时沿直线
 * 跳到对岸第一块陆地（途中水格里任一子均为鼠且挡跳），落点按吃子
 * 规则可占则可跳；任何着法不得进入己方兽穴。
 * @param pos - 当前局面。
 * @returns 合法着法数组。
 */
export function legalMoves(pos: Position): Move[] {
  const moves: Move[] = []
  const board = pos.board
  const me = pos.turn
  const myDen = denOf(me)
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const p = board[idx(row, col)] as Piece | ''
      if (p === '' || colorOf(p) !== me) continue
      const rank = RANK[p]
      const jumper = rank >= 6
      for (const [dr, dc] of ORTHO) {
        let tr = row + dr
        let tc = col + dc
        if (!inBoard(tr, tc)) continue
        let ti = idx(tr, tc)
        let jumped = false
        if (jumper && isWater(ti)) {
          // 跳河：扫过整段水格，任一水格有子（只可能是鼠）即被截断。
          let blocked = false
          while (isWater(ti)) {
            if (board[ti] !== '') { blocked = true; break }
            tr += dr
            tc += dc
            if (!inBoard(tr, tc)) { blocked = true; break }
            ti = idx(tr, tc)
          }
          if (blocked) continue
          jumped = true
        }
        // 非跳河入水：仅鼠（等级 1）可入。
        if (!jumped && isWater(ti) && rank !== 1) continue
        // 任何着法不得进入己方兽穴。
        if (ti === myDen) continue
        const t = board[ti] as Piece | ''
        if (t === '') {
          moves.push([row, col, tr, tc])
          continue
        }
        if (colorOf(t) === me) continue
        if (canCapture(p, t, isWater(idx(row, col)), !isWater(ti), isTrapOf(me, ti))) {
          moves.push([row, col, tr, tc])
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
 * 兽穴占领方：某方棋子站在对方兽穴即该方获胜。
 * @param board - 棋盘。
 * @returns 获胜方；未分出返回 null。
 */
export function denWinner(board: (Piece | '')[]): Side | null {
  const atBlack = board[BLACK_DEN] as Piece | ''
  if (atBlack !== '' && colorOf(atBlack) === 'r') return 'r'
  const atRed = board[RED_DEN] as Piece | ''
  if (atRed !== '' && colorOf(atRed) === 'b') return 'b'
  return null
}

export type Status =
  | { kind: 'playing' }
  | { kind: 'den'; winner: Side }
  | { kind: 'capture-all'; winner: Side }
  | { kind: 'stalemate'; winner: Side }

/**
 * 对局状态判定。胜利条件（按序检查）：占领对方兽穴；全歼对方棋子；
 * 对方无合法着法（困毙判负）。
 * @param pos - 待判定局面。
 * @returns 对局状态。
 */
export function status(pos: Position): Status {
  const den = denWinner(pos.board)
  if (den !== null) return { kind: 'den', winner: den }
  let redCount = 0
  let blackCount = 0
  for (const p of pos.board) {
    if (p === '') continue
    if (colorOf(p) === 'r') redCount += 1
    else blackCount += 1
  }
  if (blackCount === 0 && redCount > 0) return { kind: 'capture-all', winner: 'r' }
  if (redCount === 0 && blackCount > 0) return { kind: 'capture-all', winner: 'b' }
  if (legalMoves(pos).length === 0) return { kind: 'stalemate', winner: other(pos.turn) }
  return { kind: 'playing' }
}

/**
 * 兽穴是否告急：side 兽穴的任一相邻格（均为陆地）有敌方棋子，
 * 即对方下一步可入穴获胜。
 * @param pos - 当前局面。
 * @param side - 受威胁一方。
 * @returns 告急返回 true。
 */
export function denInDanger(pos: Position, side: Side): boolean {
  const den = denOf(side)
  const dr = rowOf(den)
  const dc = colOf(den)
  for (const [ar, ac] of ORTHO) {
    const r = dr + ar
    const c = dc + ac
    if (!inBoard(r, c)) continue
    const p = pos.board[idx(r, c)] as Piece | ''
    if (p !== '' && colorOf(p) === other(side)) return true
  }
  return false
}

/** 局面键（63 格摆放 + 行棋方），用于确定性对比。 */
export function positionKey(pos: Position): string {
  let s = ''
  for (let i = 0; i < ROWS * COLS; i += 1) s += pos.board[i] === '' ? '.' : pos.board[i]
  return s + ' ' + pos.turn
}
