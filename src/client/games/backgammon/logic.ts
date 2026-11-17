/**
 * 双陆棋（Backgammon，1v1 对 AI）纯逻辑：24 个尖点 + 中栏 bar + 出局槽。
 * 玩家（you）沿 24→1 方向行进，内区为 1-6 点；AI 相反（1→24，内区
 * 19-24）。每回合掷两骰：非对子各走一次（可同子连走、可拆分顺序），
 * 对子走四次；目标点被对方 2 枚以上棋子占据即被阻挡；恰好落在对方
 * 单子上为打吃（对方子上栏，上栏方须先从对方内区重新入场）；全部
 * 棋子进入己方内区后方可按点数移出（bear off，恰好点数直接移出、
 * 超出点数仅当身后没有更远棋子），先全部移出者赢下该局，3 局 2 胜
 * （不含加倍骰）。
 *
 * AI 为一层贪心 + 启发式（打吃 > 救出被困子 > 立点堆叠 > 推进 pip），
 * 候选打分混入 seed 派生的确定性噪声。所有随机（掷骰、AI 噪声）均由
 * seed 派生（mulberry32），不藏私有随机源：同一 seed 与同一操作序列
 * 必然得到同一状态，可脱离 DOM 直接模拟与重放。
 */

/** 一方标识：you 玩家（24→1）/ ai 电脑（1→24）。 */
export type Side = 'you' | 'ai'

/** 阶段：待掷骰 / 待行子 / 一局结束 / 整场结束。 */
export type BackgammonPhase = 'roll' | 'move' | 'roundOver' | 'matchOver'

/** 一步棋：die 点数，from 出发点（0 = 从中栏入场），to 落点（0 = 移出 bear off）。 */
export interface Move {
  die: number
  from: number
  to: number
  /** 该步是否打吃（对方单子被送上栏）。 */
  hit: boolean
}

/** 棋盘：you/ai 各 24 点的棋子数（下标 i = 第 i+1 点）+ 中栏 + 出局。 */
export interface Board {
  you: number[]
  ai: number[]
  barYou: number
  barAi: number
  offYou: number
  offAi: number
}

/** 一场比赛的完整可测状态（JSON 可序列化纯数据）。 */
export interface BackgammonState {
  seed: number
  /** 局号（从 1 起，最多 3 局）。 */
  round: number
  phase: BackgammonPhase
  turn: Side
  /** 本局掷骰次数（掷骰随机流的确定性计数器）。 */
  rollNo: number
  board: Board
  /** 最近一次掷出的两骰面（未掷或已结算为 null）。 */
  dice: [number, number] | null
  /** 本回合尚未使用的骰面（对子为 4 个）。 */
  remaining: number[]
  /** 本回合已走的步（回合结束后归入 lastTurn）。 */
  turnMoves: Move[]
  /** 已结束回合的记录（展示与复盘用）。 */
  lastTurn: { side: Side, dice: [number, number], moves: Move[] } | null
  /** 本局胜者（roundOver / matchOver 时非 null）。 */
  roundWinner: Side | null
  roundWinsYou: number
  roundWinsAi: number
  matchWinner: Side | null
  message: string
}

/** 夺冠所需局数（3 局 2 胜）。 */
export const ROUNDS_TO_WIN = 2
/** 每方棋子总数。 */
export const CHECKERS = 15

/**
 * mulberry32 确定性伪随机数发生器。
 * @param seed - 32 位种子。
 * @returns 返回 [0,1) 随机数的函数。
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
 * 标准初始棋盘：每方 15 子——24 点 2 枚、13 点 5 枚、8 点 3 枚、6 点
 * 5 枚（AI 沿中线镜像）。
 */
export function initialBoard(): Board {
  const you = new Array<number>(24).fill(0)
  const ai = new Array<number>(24).fill(0)
  you[23] = 2
  you[12] = 5
  you[7] = 3
  you[5] = 5
  ai[0] = 2
  ai[11] = 5
  ai[16] = 3
  ai[18] = 5
  return { you, ai, barYou: 0, barAi: 0, offYou: 0, offAi: 0 }
}

/** 深拷贝棋盘（枚举回合时在副本上推演）。 */
export function cloneBoard(board: Board): Board {
  return {
    you: [...board.you],
    ai: [...board.ai],
    barYou: board.barYou,
    barAi: board.barAi,
    offYou: board.offYou,
    offAi: board.offAi,
  }
}

/** 己方在点 p（1..24）的棋子数。 */
export function ownAt(board: Board, side: Side, p: number): number {
  return side === 'you' ? board.you[p - 1]! : board.ai[p - 1]!
}

/** 对方在点 p（1..24）的棋子数。 */
export function oppAt(board: Board, side: Side, p: number): number {
  return side === 'you' ? board.ai[p - 1]! : board.you[p - 1]!
}

/**
 * 全部棋子是否已进入己方内区（you 为 1-6 点、ai 为 19-24 点，且中栏
 * 为空）——bear off 的资格条件。
 */
export function canBearOff(board: Board, side: Side): boolean {
  if (side === 'you') {
    if (board.barYou > 0) return false
    for (let p = 7; p <= 24; p += 1) if (board.you[p - 1]! > 0) return false
    return true
  }
  if (board.barAi > 0) return false
  for (let p = 1; p <= 18; p += 1) if (board.ai[p - 1]! > 0) return false
  return true
}

/**
 * 掷某一骰后己方的全部合法单步（不含「必须用满骰子」的整体约束）。
 * 中栏优先：中栏有子时只生成入场步（you 入 25-die，ai 入 die，被对方
 * 2+ 子占据即整骰作废）；bear off 需 {@link canBearOff} 且遵循恰好 /
 * 超出规则。
 * @param board - 当前棋盘（不修改）。
 * @param side - 行子方。
 * @param die - 骰面（1-6）。
 * @returns 合法单步列表。
 */
export function legalSingleMoves(board: Board, side: Side, die: number): Move[] {
  const moves: Move[] = []
  const bar = side === 'you' ? board.barYou : board.barAi
  if (bar > 0) {
    const entry = side === 'you' ? 25 - die : die
    if (oppAt(board, side, entry) < 2) {
      moves.push({ die, from: 0, to: entry, hit: oppAt(board, side, entry) === 1 })
    }
    return moves
  }
  const bear = canBearOff(board, side)
  for (let p = 1; p <= 24; p += 1) {
    if (ownAt(board, side, p) === 0) continue
    const target = side === 'you' ? p - die : p + die
    if (target >= 1 && target <= 24) {
      if (oppAt(board, side, target) < 2) {
        moves.push({ die, from: p, to: target, hit: oppAt(board, side, target) === 1 })
      }
      continue
    }
    if (!bear) continue
    if (side === 'you') {
      // you 家门在 1 点：恰好 die===p 直接出；die>p 时身后（更高点）须无子。
      if (die === p) {
        moves.push({ die, from: p, to: 0, hit: false })
      } else if (die > p) {
        let farther = false
        for (let q = p + 1; q <= 6; q += 1) {
          if (board.you[q - 1]! > 0) { farther = true; break }
        }
        if (!farther) moves.push({ die, from: p, to: 0, hit: false })
      }
    } else {
      // ai 家门在 24 点：距出口 25-p，恰好 die===25-p 直接出；超出时
      // 更远（更低点）须无子。
      const dist = 25 - p
      if (die === dist) {
        moves.push({ die, from: p, to: 0, hit: false })
      } else if (die > dist) {
        let farther = false
        for (let q = p - 1; q >= 19; q -= 1) {
          if (board.ai[q - 1]! > 0) { farther = true; break }
        }
        if (!farther) moves.push({ die, from: p, to: 0, hit: false })
      }
    }
  }
  return moves
}

/**
 * 在棋盘上落实一步（就地修改）：出发减一（中栏或点），落点加一或出
 * 局加一；打吃时对方单子送上栏。
 */
export function applyMove(board: Board, side: Side, move: Move): void {
  if (move.from === 0) {
    if (side === 'you') board.barYou -= 1
    else board.barAi -= 1
  } else if (side === 'you') {
    board.you[move.from - 1]! -= 1
  } else {
    board.ai[move.from - 1]! -= 1
  }
  if (move.to === 0) {
    if (side === 'you') board.offYou += 1
    else board.offAi += 1
    return
  }
  if (oppAt(board, side, move.to) === 1) {
    if (side === 'you') {
      board.ai[move.to - 1]! = 0
      board.barAi += 1
    } else {
      board.you[move.to - 1]! = 0
      board.barYou += 1
    }
  }
  if (side === 'you') board.you[move.to - 1]! += 1
  else board.ai[move.to - 1]! += 1
}

/** 序列键：候选回合去重与确定性比较。 */
function turnKey(moves: readonly Move[]): string {
  return moves.map(m => m.from + '-' + m.to + (m.hit ? 'h' : '')).join(',')
}

/**
 * 枚举一次掷骰后的全部合法完整回合（非对子两骰可拆两种顺序，对子四
 * 步），并施加「必须用满可用骰子；只能用一骰时须用较大骰面」规则：
 * 返回的每个候选都是该规则下的极大用法。
 * @param board - 回合开始时的棋盘（不修改）。
 * @param side - 行子方。
 * @param dice - 两骰面。
 * @returns 合法回合（步序列）列表；无任何可走步时为空数组。
 */
export function enumerateTurns(board: Board, side: Side, dice: [number, number]): Move[][] {
  const values = dice[0] === dice[1] ? [dice[0]!, dice[0]!, dice[0]!, dice[0]!] : [dice[0]!, dice[1]!]
  const found: Move[][] = []
  const seen = new Set<string>()

  const walk = (b: Board, remaining: number[], path: Move[]): void => {
    if (path.length > 0) {
      const key = turnKey(path)
      if (!seen.has(key)) {
        seen.add(key)
        found.push([...path])
      }
    }
    const tried = new Set<number>()
    for (let i = 0; i < remaining.length; i += 1) {
      const die = remaining[i]!
      if (tried.has(die)) continue
      tried.add(die)
      for (const move of legalSingleMoves(b, side, die)) {
        const next = cloneBoard(b)
        applyMove(next, side, move)
        walk(next, [...remaining.slice(0, i), ...remaining.slice(i + 1)], [...path, move])
      }
    }
  }
  walk(board, values, [])

  let maxLen = 0
  for (const t of found) maxLen = Math.max(maxLen, t.length)
  let cands = found.filter(t => t.length === maxLen)
  if (maxLen === 1 && dice[0] !== dice[1]) {
    // 只能用到一骰：规则要求用较大的骰面（若较大骰确实可走）。
    const larger = Math.max(dice[0]!, dice[1]!)
    const withLarger = cands.filter(t => t[0]!.die === larger)
    if (withLarger.length > 0) cands = withLarger
  }
  return cands
}

/** 某方在剩余骰面下是否存在任何合法单步。 */
export function hasAnyMove(board: Board, side: Side, remaining: readonly number[]): boolean {
  const tried = new Set<number>()
  for (const die of remaining) {
    if (tried.has(die)) continue
    tried.add(die)
    if (legalSingleMoves(board, side, die).length > 0) return true
  }
  return false
}

/** 己方 pip 距离（行至出口的总点数，中栏按 25 计）——进度度量。 */
export function pipCount(board: Board, side: Side): number {
  let sum = 0
  for (let p = 1; p <= 24; p += 1) {
    const c = ownAt(board, side, p)
    sum += c * (side === 'you' ? p : 25 - p)
  }
  sum += (side === 'you' ? board.barYou : board.barAi) * 25
  return sum
}

/**
 * 开新比赛：第 1 局、标准初始盘、玩家先掷。
 * @param seed - 基础种子。
 */
export function createBackgammon(seed: number): BackgammonState {
  return {
    seed,
    round: 1,
    phase: 'roll',
    turn: 'you',
    rollNo: 0,
    board: initialBoard(),
    dice: null,
    remaining: [],
    turnMoves: [],
    lastTurn: null,
    roundWinner: null,
    roundWinsYou: 0,
    roundWinsAi: 0,
    matchWinner: null,
    message: '第 1 局 · 空格掷骰',
  }
}

/**
 * 掷骰随机流：seed × 局号 × 局内掷骰计数派生，两骰独立可重放。
 * @param state - 当前状态。
 * @returns 本次的两个骰面。
 */
export function deriveDice(state: BackgammonState): [number, number] {
  const mixed = (state.seed ^ Math.imul(state.round, 0x9e3779b9) ^ Math.imul(state.rollNo + 1, 0x85ebca6b)) >>> 0
  const rng = mulberry32(mixed)
  return [1 + Math.floor(rng() * 6), 1 + Math.floor(rng() * 6)]
}

/**
 * 结算一局胜负：记局分，先取 {@link ROUNDS_TO_WIN} 局者夺整场。
 * @param state - 当前状态。
 * @param winner - 该局胜者。
 */
function settleRound(state: BackgammonState, winner: Side): void {
  state.roundWinner = winner
  state.lastTurn = null
  state.dice = null
  state.remaining = []
  state.turnMoves = []
  if (winner === 'you') state.roundWinsYou += 1
  else state.roundWinsAi += 1
  if (state.roundWinsYou >= ROUNDS_TO_WIN || state.roundWinsAi >= ROUNDS_TO_WIN) {
    state.matchWinner = state.roundWinsYou >= ROUNDS_TO_WIN ? 'you' : 'ai'
    state.phase = 'matchOver'
    state.message = state.matchWinner === 'you' ? '你拿下整场胜利！' : '对方拿下整场胜利'
  } else {
    state.phase = 'roundOver'
    state.message = winner === 'you'
      ? '第 ' + state.round + ' 局你胜 · 空格继续'
      : '第 ' + state.round + ' 局对方胜 · 空格继续'
  }
}

/**
 * 结束当前行子回合：若行子方已全部移出即结算该局，否则掷骰权交给
 * 对方。
 */
function endTurn(state: BackgammonState): void {
  if (state.board.offYou >= CHECKERS) {
    settleRound(state, 'you')
    return
  }
  if (state.board.offAi >= CHECKERS) {
    settleRound(state, 'ai')
    return
  }
  state.lastTurn = { side: state.turn, dice: state.dice!, moves: [...state.turnMoves] }
  state.turnMoves = []
  state.turn = state.turn === 'you' ? 'ai' : 'you'
  state.phase = 'roll'
}

/**
 * 掷骰并进入行子阶段（就地修改）：写入骰面与剩余骰；若行子方两骰皆
 * 无合法步则直接跳过回合（对方获得掷骰权）。
 * @param state - 当前状态（须处于 phase==='roll'）。
 * @returns 实际掷出的骰面；非待掷阶段返回 null。
 */
export function rollFor(state: BackgammonState): [number, number] | null {
  if (state.phase !== 'roll') return null
  const dice = deriveDice(state)
  state.rollNo += 1
  state.dice = dice
  state.remaining = dice[0] === dice[1] ? [dice[0]!, dice[0]!, dice[0]!, dice[0]!] : [dice[0]!, dice[1]!]
  state.phase = 'move'
  state.message = (state.turn === 'you' ? '你' : '对方') + '掷出 ' + dice[0]! + ' + ' + dice[1]!
  if (!hasAnyMove(state.board, state.turn, state.remaining)) {
    state.message += ' · 无子可动，跳过回合'
    state.lastTurn = { side: state.turn, dice, moves: [] }
    state.turn = state.turn === 'you' ? 'ai' : 'you'
    state.phase = 'roll'
  }
  return dice
}

/** 从剩余骰中挑出匹配 from/to 的合法单步（不修改棋盘）。 */
function pickMoveFromRemaining(board: Board, side: Side, remaining: readonly number[], from: number, to: number): Move | null {
  const tried = new Set<number>()
  for (const die of remaining) {
    if (tried.has(die)) continue
    tried.add(die)
    for (const m of legalSingleMoves(board, side, die)) {
      if (m.from === from && m.to === to) return m
    }
  }
  return null
}

function removeOne(list: readonly number[], value: number): number[] {
  const out = [...list]
  const i = out.indexOf(value)
  if (i >= 0) out.splice(i, 1)
  return out
}

/**
 * 玩家走一步（就地修改）：在剩余骰中寻找 from→to 的合法单步并落实；
 * 骰子用尽或剩余骰无步可走时自动结束回合。
 * @param state - 当前状态（须 phase==='move' 且 turn==='you'）。
 * @param from - 出发点（0 = 中栏）。
 * @param to - 落点（0 = bear off）。
 * @returns 找到并落实为 true；无合法步或轮次不对为 false。
 */
export function playerMove(state: BackgammonState, from: number, to: number): boolean {
  if (state.phase !== 'move' || state.turn !== 'you') return false
  const move = pickMoveFromRemaining(state.board, 'you', state.remaining, from, to)
  if (move === null) return false
  applyMove(state.board, 'you', move)
  state.remaining = removeOne(state.remaining, move.die)
  state.turnMoves.push(move)
  if (move.hit) state.message = '打吃！对方子上栏'
  if (state.remaining.length === 0 || !hasAnyMove(state.board, 'you', state.remaining)) {
    if (state.remaining.length > 0) state.message = '剩余骰面无子可动'
    endTurn(state)
  }
  return true
}

/**
 * AI 启发式打分（纯函数，side 任意）：对候选回合在副本上推演，按
 * 打吃 > 救出被困子（中栏与对方内区）> 立点堆叠 > 推进 pip / 移出
 * 计分，最后叠加 seed 派生的确定性噪声。
 * @param board - 回合开始的棋盘。
 * @param side - 行子方（aiTurn 用 'ai'；重放测试可替 'you' 侧决策）。
 * @param moves - 候选步序列。
 * @param noiseSeed - 噪声种子（同种子同分）。
 * @returns 该候选的分数（越高越优）。
 */
export function scoreAiTurn(board: Board, side: Side, moves: readonly Move[], noiseSeed: number): number {
  const b = cloneBoard(board)
  let hits = 0
  for (const m of moves) {
    if (m.hit) hits += 1
    applyMove(b, side, m)
  }
  const homeStart = side === 'you' ? 1 : 19
  const offStart = side === 'you' ? b.offYou : b.offAi
  let score = hits * 34
  score += (offStart - (side === 'you' ? board.offYou : board.offAi)) * 28
  score += pipCount(board, side) - pipCount(b, side)
  // 救出被困子：中栏与对方内区（各 6 点）里的子按减少量奖励。
  const oppHomeStart = side === 'you' ? 19 : 1
  const trapped = (x: Board): number => {
    let sum = (side === 'you' ? x.barYou : x.barAi) * 25
    for (let p = oppHomeStart; p < oppHomeStart + 6; p += 1) {
      sum += ownAt(x, side, p) * 6
    }
    return sum
  }
  score += trapped(board) - trapped(b)
  // 立点（2 子以上）奖励按离家的远近递减；过度堆叠与内区裸子受罚。
  for (let p = 1; p <= 24; p += 1) {
    const c = ownAt(b, side, p)
    if (c >= 2) {
      const dist = side === 'you' ? p : 25 - p
      if (dist >= 19) score += 4
      else if (dist >= 13) score += 3
      else if (dist >= 7) score += 2
      if (c > 4) score -= (c - 4) * 2
    } else if (c === 1 && p >= homeStart && p < homeStart + 6) {
      score -= 1
    }
  }
  const key = turnKey(moves)
  let hash = noiseSeed >>> 0
  for (let i = 0; i < key.length; i += 1) hash = (Math.imul(hash, 31) + key.charCodeAt(i)) >>> 0
  score += mulberry32(hash)() * 2.5
  return score
}

/**
 * AI 选择完整回合（纯函数，不修改棋盘）：枚举合法回合取启发式最高分
 * （并列取首者），完全由棋盘、骰面与噪声种子决定。
 * @param board - 回合开始的棋盘。
 * @param side - 行子方。
 * @param dice - 两骰面。
 * @param noiseSeed - 噪声种子。
 * @returns 选中的步序列；无可走步为空数组。
 */
export function chooseAiTurn(board: Board, side: Side, dice: [number, number], noiseSeed: number): Move[] {
  const cands = enumerateTurns(board, side, dice)
  let best: Move[] = []
  let bestScore = -Infinity
  for (const c of cands) {
    const s = scoreAiTurn(board, side, c, noiseSeed)
    if (s > bestScore) {
      bestScore = s
      best = c
    }
  }
  return best
}

/**
 * AI 执行整个回合（就地修改）：选择、逐步落实并结束回合。
 * @param state - 当前状态（须 phase==='move' 且 turn==='ai'）。
 * @returns 实际走出的步序列（可为空——掷骰阶段已过滤无步回合）。
 */
export function aiTurn(state: BackgammonState): Move[] {
  if (state.phase !== 'move' || state.turn !== 'ai' || state.dice === null) return []
  const noise = (state.seed ^ Math.imul(state.round, 0x27d4eb2d) ^ Math.imul(state.rollNo, 0x165667b1)) >>> 0
  const moves = chooseAiTurn(state.board, 'ai', state.dice, noise)
  for (const m of moves) {
    applyMove(state.board, 'ai', m)
    state.remaining = removeOne(state.remaining, m.die)
    state.turnMoves.push(m)
  }
  let hits = 0
  for (const m of moves) if (m.hit) hits += 1
  state.message = '对方走了 ' + moves.length + ' 步' + (hits > 0 ? ' · 打吃 ' + hits + ' 子' : '')
  endTurn(state)
  return moves
}

/**
 * 进入下一局（就地修改）：重置棋盘，先手随局号轮换（奇数局你、偶数
 * 局对方）；整场已结束时不变。
 */
export function nextRound(state: BackgammonState): void {
  if (state.phase !== 'roundOver') return
  state.round += 1
  state.board = initialBoard()
  state.dice = null
  state.remaining = []
  state.turnMoves = []
  state.lastTurn = null
  state.roundWinner = null
  state.turn = state.round % 2 === 1 ? 'you' : 'ai'
  state.phase = 'roll'
  state.message = '第 ' + state.round + ' 局 · ' + (state.turn === 'you' ? '空格掷骰' : '对方先掷')
}
