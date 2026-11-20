/**
 * 鬼墙 (Quoridor) 纯逻辑。9×9 格棋盘：玩家 0（南方，起点 (4,8)，目标
 * 第 0 行）与玩家 1（北方，起点 (4,0)，目标第 8 行）轮流行动——走一步
 * 棋（上下左右，不可穿墙；正对对方棋子可直跳，直跳被墙或棋盘边挡住
 * 时可斜跳）或放置一块 2 格长的墙（横/竖；不得越界、重叠、交叉，且
 * 放置后双方仍必须能经 BFS 到达各自目标行）。任一方棋子先到对方底
 * 边即胜。AI 采用最短路差值启发（缩短己方 / 拉长对方），难度分级控
 * 制墙的考虑与噪声幅度；全部随机经 mulberry32 注入 seed，决策确定
 * 可测。
 */

/** 棋盘边长（格）。 */
export const BOARD = 9
/** 每方墙的配额。 */
export const WALLS_PER_PLAYER = 10

/** 棋盘上的格子坐标：c 列（0..8，左起），r 行（0..8，顶起）。 */
export interface Pos {
  c: number
  r: number
}

/** 墙的走向：h 横墙（隔开上下两行），v 竖墙（隔开左右两列）。 */
export type WallOrient = 'h' | 'v'

/** 一局鬼墙的全部状态（纯数据，可安全复制）。 */
export interface QuoridorState {
  /** 双方棋子坐标：下标 0 南方、1 北方。 */
  pawns: [Pos, Pos]
  /** 双方剩余墙数。 */
  wallStock: [number, number]
  /** 横墙占用表：hWalls[r*8+c] 为 1 表示锚点 (c,r)（c,r∈0..7）处有横墙，覆盖格子 (c,r)(c+1,r) 与 (c,r+1)(c+1,r+1) 之间的两条边。 */
  hWalls: Uint8Array
  /** 竖墙占用表：vWalls[r*8+c] 为 1 表示锚点 (c,r) 处有竖墙，覆盖格子 (c,r)(c+1,r) 与 (c,r+1)(c+1,r+1) 之间的两条边。 */
  vWalls: Uint8Array
  /** 每块墙的放置者（0/1），-1 为空，用于着色与回放。 */
  wallOwners: Int8Array
  /** 当前行动方。 */
  turn: 0 | 1
  /** 胜者（棋子到达目标行的一方），null 为进行中。 */
  winner: 0 | 1 | null
}

/** 玩家的目标行：南方 0 向上走到第 0 行，北方 1 向下走到第 8 行。 */
export function goalRow(player: 0 | 1): number {
  return player === 0 ? 0 : BOARD - 1
}

/** mulberry32 伪随机数发生器：同 seed 序列确定（与各游戏共用的写法一致）。 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x9e3779f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 开局：双方各在己方底边中央，各 10 块墙，南方先行。 */
export function createGame(): QuoridorState {
  const n = (BOARD - 1) * (BOARD - 1)
  return {
    pawns: [{ c: 4, r: BOARD - 1 }, { c: 4, r: 0 }],
    wallStock: [WALLS_PER_PLAYER, WALLS_PER_PLAYER],
    hWalls: new Uint8Array(n),
    vWalls: new Uint8Array(n),
    wallOwners: new Int8Array(n),
    turn: 0,
    winner: null,
  }
}

/** 深拷贝一份状态（供推导落子后的新局面）。 */
export function cloneState(s: QuoridorState): QuoridorState {
  return {
    pawns: [{ ...s.pawns[0]! }, { ...s.pawns[1]! }],
    wallStock: [s.wallStock[0]!, s.wallStock[1]!],
    hWalls: new Uint8Array(s.hWalls),
    vWalls: new Uint8Array(s.vWalls),
    wallOwners: new Int8Array(s.wallOwners),
    turn: s.turn,
    winner: s.winner,
  }
}

/**
 * 相邻两格之间是否有墙。a、b 必须相邻（曼哈顿距离 1）。
 * @param s - 当前局面。
 * @param a - 起点格。
 * @param b - 终点格。
 * @returns 有墙返回 true。
 */
export function wallBetween(s: QuoridorState, a: Pos, b: Pos): boolean {
  const c = Math.min(a.c, b.c)
  const r = Math.min(a.r, b.r)
  if (a.c === b.c) {
    // 纵向移动：被锚点行 r 上、覆盖列 c 的横墙挡住。
    if (c > 0 && s.hWalls[r * 8 + (c - 1)] === 1) return true
    if (c < BOARD - 1 && s.hWalls[r * 8 + c] === 1) return true
    return false
  }
  // 横向移动：被覆盖行 r 的竖墙挡住。
  if (r > 0 && s.vWalls[(r - 1) * 8 + c] === 1) return true
  if (r < BOARD - 1 && s.vWalls[r * 8 + c] === 1) return true
  return false
}

/**
 * 当前方的一步走子合法落点集合（含面对面对跳与斜跳）：
 * - 普通一步：相邻格无墙且无对方棋子；
 * - 正对对方棋子：先看直跳（越过对方再走一格，两段都不能穿墙、不能出盘）；
 * - 直跳被墙或棋盘边挡住时：允许斜跳到对方棋子两侧（每段同样不可穿墙）。
 * @param s - 当前局面。
 * @returns 合法落点数组。
 */
export function legalSteps(s: QuoridorState): Pos[] {
  if (s.winner !== null) return []
  const me = s.pawns[s.turn]!
  const opp = s.pawns[s.turn === 0 ? 1 : 0]!
  const out: Pos[] = []
  const dirs: Array<[number, number]> = [[0, -1], [0, 1], [-1, 0], [1, 0]]
  const inside = (c: number, r: number): boolean => c >= 0 && c < BOARD && r >= 0 && r < BOARD
  for (const [dc, dr] of dirs) {
    const nc = me.c + dc
    const nr = me.r + dr
    if (!inside(nc, nr)) continue
    if (wallBetween(s, me, { c: nc, r: nr })) continue
    if (nc === opp.c && nr === opp.r) {
      const jc = me.c + dc * 2
      const jr = me.r + dr * 2
      let jumped = false
      if (inside(jc, jr) && !wallBetween(s, { c: nc, r: nr }, { c: jc, r: jr })) {
        out.push({ c: jc, r: jr })
        jumped = true
      }
      if (jumped) continue
      // 直跳不通（墙挡或出盘）：斜跳到对方两侧。
      for (const [pc, pr] of dirs) {
        if (pc === dc && pr === dr) continue
        if (pc === -dc && pr === -dr) continue
        const tc = nc + pc
        const tr = nr + pr
        if (!inside(tc, tr)) continue
        if (wallBetween(s, { c: nc, r: nr }, { c: tc, r: tr })) continue
        out.push({ c: tc, r: tr })
      }
    } else {
      out.push({ c: nc, r: nr })
    }
  }
  return out
}

/** 某玩家从棋子到其目标行的最短步数。
 * @param s - 当前局面（墙与双方棋子位置均计入）。
 * @param player - 玩家下标。
 * @returns 最短步数；不可达返回 -1（合法局面不会出现）。
 */
export function shortestPath(s: QuoridorState, player: 0 | 1): number {
  const goal = goalRow(player)
  const start = s.pawns[player]!
  const seen = new Uint8Array(BOARD * BOARD)
  let frontier: Pos[] = [start]
  seen[start.r * BOARD + start.c] = 1
  let steps = 0
  while (frontier.length > 0) {
    const next: Pos[] = []
    for (const p of frontier) {
      if (p.r === goal) return steps
      const dirs: Array<[number, number]> = [[0, -1], [0, 1], [-1, 0], [1, 0]]
      for (const [dc, dr] of dirs) {
        const q = { c: p.c + dc, r: p.r + dr }
        if (q.c < 0 || q.c >= BOARD || q.r < 0 || q.r >= BOARD) continue
        if (seen[q.r * BOARD + q.c] === 1) continue
        if (wallBetween(s, p, q)) continue
        seen[q.r * BOARD + q.c] = 1
        next.push(q)
      }
    }
    frontier = next
    steps += 1
  }
  return -1
}

/** 墙锚点是否在 8×8 槽位范围内。 */
function slotInBounds(c: number, r: number): boolean {
  return c >= 0 && c <= BOARD - 2 && r >= 0 && r <= BOARD - 2
}

/**
 * 当前方能否在锚点 (c,r) 放一块指定走向的墙：需在界内、未越界于配额、
 * 不与既有墙重叠（同走向相邻锚点）或交叉（同一锚点的横竖墙），且放置
 * 后双方仍都能 BFS 到达各自目标行（不得完全堵死）。
 * @param s - 当前局面。
 * @param orient - 墙走向。
 * @param c - 锚点列（0..7）。
 * @param r - 锚点行（0..7）。
 * @returns 合法返回 true。
 */
export function canPlaceWall(s: QuoridorState, orient: WallOrient, c: number, r: number): boolean {
  if (s.winner !== null) return false
  if (s.wallStock[s.turn] <= 0) return false
  if (!slotInBounds(c, r)) return false
  const i = r * 8 + c
  if (orient === 'h') {
    if (s.hWalls[i] === 1) return false
    if (c > 0 && s.hWalls[i - 1] === 1) return false
    if (c < BOARD - 2 && s.hWalls[i + 1] === 1) return false
    if (s.vWalls[i] === 1) return false
  } else {
    if (s.vWalls[i] === 1) return false
    if (r > 0 && s.vWalls[i - 8] === 1) return false
    if (r < BOARD - 2 && s.vWalls[i + 8] === 1) return false
    if (s.hWalls[i] === 1) return false
  }
  const probe = cloneState(s)
  if (orient === 'h') probe.hWalls[i] = 1
  else probe.vWalls[i] = 1
  return shortestPath(probe, 0) >= 0 && shortestPath(probe, 1) >= 0
}

/**
 * 当前方放墙并轮转行动权。
 * @param s - 当前局面。
 * @param orient - 墙走向。
 * @param c - 锚点列（0..7）。
 * @param r - 锚点行（0..7）。
 * @returns 新局面；任何不合法（含可达性破坏）返回 null。
 */
export function placeWall(s: QuoridorState, orient: WallOrient, c: number, r: number): QuoridorState | null {
  if (!canPlaceWall(s, orient, c, r)) return null
  const ns = cloneState(s)
  const i = r * 8 + c
  if (orient === 'h') ns.hWalls[i] = 1
  else ns.vWalls[i] = 1
  ns.wallOwners[i] = s.turn
  ns.wallStock[s.turn] = s.wallStock[s.turn] - 1
  ns.turn = s.turn === 0 ? 1 : 0
  return ns
}

/**
 * 当前方把棋子走到合法落点并轮转行动权；到达目标行即判胜。
 * @param s - 当前局面。
 * @param to - 目标格（必须在 legalSteps 内）。
 * @returns 新局面；落点不合法返回 null。
 */
export function movePawn(s: QuoridorState, to: Pos): QuoridorState | null {
  if (s.winner !== null) return null
  const steps = legalSteps(s)
  if (!steps.some(p => p.c === to.c && p.r === to.r)) return null
  const ns = cloneState(s)
  ns.pawns[s.turn] = { c: to.c, r: to.r }
  if (to.r === goalRow(s.turn)) ns.winner = s.turn
  else ns.turn = s.turn === 0 ? 1 : 0
  return ns
}

/** AI 的一个行动：走子到 to，或在锚点放墙。 */
export type AiAction =
  | { type: 'move'; to: Pos }
  | { type: 'wall'; orient: WallOrient; c: number; r: number }

/** 不可达距离的哨兵值（合法局面不该出现，仅防御）。 */
const UNREACHABLE = 999

/**
 * 从 AI 视角评估局面：对方最短路 − 己方最短路（越大越好）。
 * @param s - 行动后的局面。
 * @param me - AI 所执玩家下标。
 * @returns 评估值。
 */
export function evaluateState(s: QuoridorState, me: 0 | 1): number {
  const my = shortestPath(s, me)
  const op = shortestPath(s, me === 0 ? 1 : 0)
  return (op < 0 ? UNREACHABLE : op) - (my < 0 ? UNREACHABLE : my)
}

/**
 * AI 决策（确定性）：遍历全部走子与（有墙时）全部合法放墙，按最短路
 * 差值启发打分取最优；seed 注入 mulberry32 噪声打破平手。难度分级：
 * 0 级只走子（新手）；1 级走子 + 放墙、噪声 0.6；2 级再叠加一步对方
 * 贪心回应（近似两 ply）、零噪声。
 * @param s - 当前局面（以 s.turn 一方视角决策）。
 * @param seed - 伪随机 seed（同 seed 同局面决策确定）。
 * @param level - 难度 0/1/2。
 * @returns 行动对象；无合法行动（不应出现）返回 null。
 */
export function chooseAiAction(s: QuoridorState, seed: number, level: number): AiAction | null {
  if (s.winner !== null) return null
  const me = s.turn
  // 一手致胜的走子直接走。
  for (const step of legalSteps(s)) {
    if (step.r === goalRow(me)) return { type: 'move', to: step }
  }
  const rng = mulberry32(seed)
  const noiseAmp = level <= 0 ? 0.9 : level === 1 ? 0.6 : 0
  const scored: Array<{ action: AiAction; score: number }> = []
  for (const step of legalSteps(s)) {
    const ns = movePawn(s, step)
    if (ns === null) continue
    scored.push({ action: { type: 'move', to: step }, score: evaluateState(ns, me) })
  }
  if (s.wallStock[me] > 0 && level >= 1) {
    for (let r = 0; r < BOARD - 1; r += 1) {
      for (let c = 0; c < BOARD - 1; c += 1) {
        for (const orient of ['h', 'v'] as WallOrient[]) {
          const ns = placeWall(s, orient, c, r)
          if (ns === null) continue
          let score = evaluateState(ns, me)
          if (level >= 2) {
            // 一步对方贪心回应：取对方走子后对我最差的值。
            let worst = score
            for (const reply of legalSteps(ns)) {
              const rs = movePawn(ns, reply)
              if (rs === null) continue
              const v = evaluateState(rs, me)
              if (v < worst) worst = v
            }
            score = worst
          }
          scored.push({ action: { type: 'wall', orient, c, r }, score })
        }
      }
    }
  }
  let best: { action: AiAction; score: number } | null = null
  let bestKey = -Infinity
  for (const cand of scored) {
    const key = cand.score + noiseAmp * (rng() * 2 - 1)
    if (key > bestKey) {
      bestKey = key
      best = cand
    }
  }
  return best === null ? null : best.action
}

/**
 * 按局数推进难度：0 局 0 级，1 局 1 级，2 局及以上 2 级（封顶）。
 * @param gamesPlayed - 已结束的局数。
 * @returns 难度 0/1/2。
 */
export function nextDifficulty(gamesPlayed: number): number {
  return Math.min(2, Math.max(0, Math.floor(gamesPlayed)))
}

/**
 * 三局两胜是否已定。
 * @param wins - 双方胜局数。
 * @returns 任一方拿到 2 胜返回 true。
 */
export function matchDecided(wins: [number, number]): boolean {
  return wins[0] >= 2 || wins[1] >= 2
}
