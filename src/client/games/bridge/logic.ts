/**
 * 过桥难题 Bridge 纯逻辑：手电筒过桥谜题的状态机。夜里一座窄桥一次
 * 最多容两人同行，且必须有手电照路；同行用时按较慢者计。全部函数为
 * 纯函数（不触碰 DOM / 计时器），关卡速度表由注入 seed 的 mulberry32
 * 生成，限时 = BFS 最优总用时 + 少量宽裕，确定性可测。
 */

/**
 * mulberry32 确定性伪随机数生成器。
 * @param seed - 32 位整数种子。
 * @returns 返回 [0, 1) 区间随机数的函数；同种子必产出同一序列。
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 岸侧（手电所在岸即出发岸）。 */
export type Side = 'left' | 'right'

/** 一名待过桥的人：速度 = 单独过桥所需秒数（1-10）。 */
export interface BridgePerson {
  /** 关卡内唯一 id。 */
  id: string
  /** 过桥用时（秒），数值越大走得越慢。 */
  speed: number
}

/** 一关的完整定义。 */
export interface BridgeLevel {
  /** 关卡名（HUD 显示）。 */
  name: string
  /** 本关全部人员（初始都在左岸），速度互不相同。 */
  people: BridgePerson[]
  /** 限时（秒）：全员到右岸且累计用时不得超过它。 */
  limit: number
}

/**
 * 求某关全员过桥的最少总用时（Dijkstra 最短路，状态 =（左岸成员位图,
 * 手电所在岸），边权 = 同行较慢者的用时；同时充当可行性证明）。
 * @param level 关卡定义。
 * @returns 最少总用时（秒）。
 */
export function optimalTime(level: BridgeLevel): number {
  const speeds = level.people.map(p => p.speed)
  const n = speeds.length
  const full = (1 << n) - 1
  // dist 下标 = mask * 2 + sideBit（0 = 手电在左岸）。
  const dist = new Array<number>((1 << n) * 2).fill(Infinity)
  const startKey = full * 2 + 0
  dist[startKey] = 0
  const queue: Array<[number, number]> = [[full, 0]]
  while (queue.length > 0) {
    let best = 0
    for (let i = 1; i < queue.length; i += 1) {
      if (queue[i]![1] < queue[best]![1]) best = i
    }
    const [mask, sideBit] = queue.splice(best, 1)[0]!
    const key = mask * 2 + sideBit
    const d = dist[key]!
    // 队列中的过期条目（已被更短路径覆盖）直接跳过。
    if (d === Infinity) continue
    if (mask === 0) return d
    const fromLeft = sideBit === 0
    const bankMask = fromLeft ? mask : full & ~mask
    const bits: number[] = []
    for (let i = 0; i < n; i += 1) {
      if ((bankMask & (1 << i)) !== 0) bits.push(i)
    }
    for (let i = 0; i < bits.length; i += 1) {
      for (let j = i; j < bits.length; j += 1) {
        const cost = Math.max(speeds[bits[i]!]!, speeds[bits[j]!]!)
        const take = (1 << bits[i]!) | (j > i ? 1 << bits[j]! : 0)
        const nextMask = fromLeft ? mask & ~take : mask | take
        const nextKey = nextMask * 2 + (fromLeft ? 1 : 0)
        if (d + cost < dist[nextKey]!) {
          dist[nextKey] = d + cost
          queue.push([nextMask, fromLeft ? 1 : 0])
        }
      }
    }
  }
  return -1
}

/**
 * 由速度表构造一关：id 依次编号，限时 = 最优总用时 + 宽裕秒数。
 * @param name 关卡名。
 * @param speeds 各人过桥用时（秒）。
 * @param slack 限时超出最优解的宽裕秒数。
 * @returns 完整关卡定义。
 */
export function makeCustomLevel(name: string, speeds: number[], slack: number): BridgeLevel {
  const people: BridgePerson[] = speeds.map((speed, i) => ({ id: 'p' + String(i + 1), speed }))
  const draft: BridgeLevel = { name, people, limit: 0 }
  const optimal = optimalTime(draft)
  return { name, people, limit: optimal + slack }
}

/** 用 mulberry32 洗牌（Fisher-Yates；不修改入参）。 */
function shuffle<T>(items: T[], rand: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1))
    const tmp = out[i]!
    out[i] = out[j]!
    out[j] = tmp
  }
  return out
}

/** 由种子生成一关：从 1-10 中取 count 个互不相同的速度。 */
function seededLevel(name: string, seed: number, count: number, slack: number): BridgeLevel {
  const rand = mulberry32(seed)
  const speeds = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], rand).slice(0, count)
  return makeCustomLevel(name, speeds, slack)
}

/**
 * 五关递进：人数 4 → 6，宽裕从 +2 收紧到 +4（最优解变长后按比例放大），
 * 速度表由固定种子生成，逐关确定性不变。
 */
export const LEVELS: readonly BridgeLevel[] = [
  seededLevel('初夜过桥', 0x62721, 4, 2),
  seededLevel('二赴窄桥', 0x62722, 4, 2),
  seededLevel('五人夜行', 0x62723, 5, 3),
  seededLevel('湍上险桥', 0x62724, 5, 3),
  seededLevel('黎明长桥', 0x62725, 6, 4),
]

/**
 * 取关卡定义（越界收敛到首 / 末关）。
 * @param index 0 起的关卡下标。
 */
export function levelFor(index: number): BridgeLevel {
  const clamped = Math.min(Math.max(index, 0), LEVELS.length - 1)
  return LEVELS[clamped]!
}

/** 游戏状态：两岸名单 + 手电所在岸 + 累计用时。全部为不可变快照。 */
export interface BridgeState {
  /** 左岸人员 id 列表。 */
  left: string[]
  /** 右岸人员 id 列表。 */
  right: string[]
  /** 手电（出发权）所在岸。 */
  flashlight: Side
  /** 累计用时（秒）。 */
  elapsed: number
}

/**
 * 某关开局：全体在左岸，手电在左岸，用时 0。
 * @param levelIndex 0 起的关卡下标。
 */
export function createInitialState(levelIndex: number): BridgeState {
  const level = levelFor(levelIndex)
  return {
    left: level.people.map(p => p.id),
    right: [],
    flashlight: 'left',
    elapsed: 0,
  }
}

/**
 * 一组人同行的用时：取组内最慢者。
 * @param level 关卡定义（速度表）。
 * @param ids 同行者 id（1-2 人）。
 */
export function crossTime(level: BridgeLevel, ids: readonly string[]): number {
  const speedOf = new Map(level.people.map(p => [p.id, p.speed]))
  let worst = 0
  for (const id of ids) worst = Math.max(worst, speedOf.get(id) ?? 0)
  return worst
}

/**
 * 过桥：1-2 名手电所在岸的人携灯同行到对岸，累计用时按较慢者累加，
 * 手电翻到对岸。方向由 state.flashlight 决定，无需显式传入。
 * @param state 当前状态（不被修改）。
 * @param level 关卡定义。
 * @param ids 同行者 id 列表。
 * @returns 新状态；人数越界、含重复 id 或有人不在手电岸时返回 null。
 */
export function cross(state: BridgeState, level: BridgeLevel, ids: readonly string[]): BridgeState | null {
  void level
  if (ids.length < 1 || ids.length > 2) return null
  if (new Set(ids).size !== ids.length) return null
  const bank = state.flashlight === 'left' ? state.left : state.right
  for (const id of ids) {
    if (!bank.includes(id)) return null
  }
  const time = crossTime(level, ids)
  const fromLeft = state.flashlight === 'left'
  return {
    left: fromLeft ? state.left.filter(id => !ids.includes(id)) : [...state.left, ...ids],
    right: fromLeft ? [...state.right, ...ids] : state.right.filter(id => !ids.includes(id)),
    flashlight: fromLeft ? 'right' : 'left',
    elapsed: state.elapsed + time,
  }
}

/** 局面判定结果。 */
export type BridgeStatus =
  | { phase: 'playing' }
  | { phase: 'won' }
  | { phase: 'timeout' }

/**
 * 判定当前局面：全员到右岸（左岸清空）且未超时即胜利；累计用时超过
 * 限时即超时失败。
 * @param state 当前状态。
 * @param level 关卡定义（提供限时）。
 */
export function evaluate(state: BridgeState, level: BridgeLevel): BridgeStatus {
  if (state.left.length === 0) return { phase: 'won' }
  if (state.elapsed > level.limit) return { phase: 'timeout' }
  return { phase: 'playing' }
}
