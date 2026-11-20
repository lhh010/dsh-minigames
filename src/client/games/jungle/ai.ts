/**
 * 斗兽棋 AI：一层贪心 + 局面评估。评估项：子力价值、逼近对方兽穴的
 * 推进分、陷阱惩罚（己方子站在对方陷阱内等级归零，风险大增）。所有
 * 随机都来自 mulberry32(seed) 注入的噪声，相同局面 + 难度 + 种子下
 * 选步完全确定、可测。难度随比赛局数上升：噪声幅度递减，第三局额外
 * 扣减对手的一步最优应手（极小化一层）。
 */
import {
  applyMove, colorOf, colOf, denOf, isTrapOf, legalMoves, rowOf, status,
  type Move, type Piece, type Position, type Side,
} from './logic.ts'

/** 难度 1-3 档：[噪声幅度, 是否算对手最佳应手]。 */
const DIFFICULTY: ReadonlyArray<readonly [number, boolean]> = [[60, false], [24, false], [6, true]]

/** 子力价值（鼠能欺象而偏高；红黑同价）。 */
const VAL: Record<Piece, number> = {
  M: 500, C: 200, D: 250, W: 300, P: 600, T: 750, L: 850, E: 850,
  m: 500, c: 200, d: 250, w: 300, p: 600, t: 750, l: 850, e: 850,
}

/**
 * mulberry32 种子随机：同种子产生完全相同的随机数序列（确定性测试用）。
 * @param seed - 非负整数种子。
 * @returns 返回 [0, 1) 随机数的函数。
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * side 方视角的静态评估：己方总分减对方总分。单子分 = 子力价值 +
 * 推进分（与对方兽穴的曼哈顿距离越小越高，贴穴额外加分）+ 陷阱惩罚
 * （站在对方陷阱内 -120，因等级归零随时可被吃）。
 * @param pos - 待评估局面。
 * @param side - 评估视角方。
 * @returns side 方视角分值（正为优）。
 */
export function evaluate(pos: Position, side: Side): number {
  let s = 0
  const myDen = denOf(side)
  const foeDen = denOf(side === 'r' ? 'b' : 'r')
  for (let i = 0; i < pos.board.length; i += 1) {
    const p = pos.board[i] as Piece | ''
    if (p === '') continue
    const red = colorOf(p) === 'r'
    const mine = red === (side === 'r')
    const den = mine ? foeDen : myDen
    const dist = Math.abs(rowOf(i) - rowOf(den)) + Math.abs(colOf(i) - colOf(den))
    let v = VAL[p] + (12 - dist) * 4
    if (dist === 1) v += 25
    if (isTrapOf(red ? 'b' : 'r', i)) v -= 120
    s += mine ? v : -v
  }
  return s
}

/**
 * 选步入口（同步）：一层贪心 + 种子噪声；难度 3 额外扣减对手最佳应手
 * 后的分值。终局着法（入穴/全歼/困毙对方）按百万分识别，恒优先。
 * @param pos - 待选局面（行棋方即 AI 方）。
 * @param difficulty - 难度 1-3（噪声递减，3 加一层应手）。
 * @param seed - 随机种子（决定等分/近似分决胜）。
 * @returns 选定着法；无合法着法返回 null。
 */
export function chooseMove(pos: Position, difficulty: number, seed: number): Move | null {
  const moves = legalMoves(pos)
  if (moves.length === 0) return null
  const me = pos.turn
  const foeSide: Side = me === 'r' ? 'b' : 'r'
  const [noise, reply] = DIFFICULTY[Math.min(Math.max(difficulty, 1), 3) - 1]!
  const rng = mulberry32(seed)
  let best: Move | null = null
  let bestScore = -Infinity
  for (const m of moves) {
    const after = applyMove(pos, m)
    let s: number
    const st = status(after)
    if (st.kind !== 'playing') {
      s = st.winner === me ? 1_000_000 : -1_000_000
    } else {
      s = evaluate(after, me)
      if (reply) {
        // 极小化：扣减对手一步最优应手后的己方分。
        let worst = Infinity
        for (const f of legalMoves(after)) {
          const fa = applyMove(after, f)
          const fs = status(fa)
          const v = fs.kind !== 'playing' && fs.winner === foeSide ? -1_000_000 : evaluate(fa, me)
          if (v < worst) worst = v
          if (worst <= -1_000_000) break
        }
        if (worst !== Infinity) s = Math.min(s, worst)
      }
      s += (rng() * 2 - 1) * noise
    }
    if (s > bestScore) {
      bestScore = s
      best = m
    }
  }
  return best
}

