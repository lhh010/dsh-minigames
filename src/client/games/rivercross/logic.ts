/**
 * 过河 River Crossing 纯逻辑：经典渡河约束谜题的状态机。左岸若干角色，
 * 农夫撑船（容量 = 农夫 + 若干乘客），任一时刻无农夫看管的岸上出现
 * 捕食者与猎物同处即判定失败。全部函数为纯函数（不触碰 DOM / 计时器），
 * 随机只通过注入 seed 的 mulberry32 产生，确定性可测。
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

/** 一名可渡河的角色。 */
export interface RiverCharacter {
  /** 关卡内唯一 id。 */
  id: string
  /** 岸上 / 船上绘制的 emoji。 */
  emoji: string
  /** 中文名（警告文案用）。 */
  name: string
}

/** 一关的完整定义。 */
export interface RiverLevel {
  /** 关卡名（HUD 显示）。 */
  name: string
  /** 本关全部角色（初始都在左岸）。 */
  characters: RiverCharacter[]
  /** 捕食关系表：[捕食者 id, 猎物 id]，同岸且无人看管即失败。 */
  conflicts: Array<readonly [string, string]>
  /** 农夫之外船可载的乘客席位数。 */
  passengerSlots: number
}

/**
 * 五关递进：狼羊菜 → 狮羊 → 三对冲突链（大船）→ 特殊大船关（五角色
 * 四冲突）→ 自定义组合。注：容量 1（仅农夫、零乘客）对任何非空角色表
 * 都无解（角色永远无法离岸），故特殊容量关以“大船 + 更密冲突表”实现。
 */
export const LEVELS: readonly RiverLevel[] = [
  {
    name: '狼·羊·菜',
    characters: [
      { id: 'wolf', emoji: '🐺', name: '狼' },
      { id: 'sheep', emoji: '🐑', name: '羊' },
      { id: 'cabbage', emoji: '🥬', name: '菜' },
    ],
    conflicts: [['wolf', 'sheep'], ['sheep', 'cabbage']],
    passengerSlots: 1,
  },
  {
    name: '狮·羊',
    characters: [
      { id: 'lion', emoji: '🦁', name: '狮' },
      { id: 'sheep', emoji: '🐑', name: '羊' },
    ],
    conflicts: [['lion', 'sheep']],
    passengerSlots: 1,
  },
  {
    name: '三对冲突链',
    characters: [
      { id: 'eagle', emoji: '🦅', name: '鹰' },
      { id: 'snake', emoji: '🐍', name: '蛇' },
      { id: 'mouse', emoji: '🐁', name: '鼠' },
      { id: 'cheese', emoji: '🧀', name: '奶酪' },
    ],
    conflicts: [['eagle', 'snake'], ['snake', 'mouse'], ['mouse', 'cheese']],
    passengerSlots: 2,
  },
  {
    name: '特殊大船关',
    characters: [
      { id: 'wolf', emoji: '🐺', name: '狼' },
      { id: 'lion', emoji: '🦁', name: '狮' },
      { id: 'sheep', emoji: '🐑', name: '羊' },
      { id: 'cabbage', emoji: '🥬', name: '菜' },
      { id: 'mouse', emoji: '🐁', name: '鼠' },
    ],
    conflicts: [['wolf', 'sheep'], ['wolf', 'mouse'], ['lion', 'sheep'], ['sheep', 'cabbage']],
    passengerSlots: 2,
  },
  {
    name: '熊·蜜·蜂',
    characters: [
      { id: 'bear', emoji: '🐻', name: '熊' },
      { id: 'honey', emoji: '🍯', name: '蜂蜜' },
      { id: 'bee', emoji: '🐝', name: '蜂' },
    ],
    conflicts: [['bear', 'honey'], ['bee', 'bear']],
    passengerSlots: 1,
  },
]

/** 岸侧。 */
export type Side = 'left' | 'right'

/** 游戏状态：两岸成员 + 船位 + 已上船乘客。全部为不可变快照。 */
export interface RiverState {
  /** 左岸角色 id 列表。 */
  left: string[]
  /** 右岸角色 id 列表。 */
  right: string[]
  /** 船（和农夫）当前停靠的岸。 */
  boatSide: Side
  /** 已上船、待渡河的乘客 id（仍视为在停靠岸的看管之下）。 */
  boat: string[]
}

/**
 * 取关卡定义（越界收敛到首 / 末关）。
 * @param index 0 起的关卡下标。
 */
export function levelFor(index: number): RiverLevel {
  const clamped = Math.min(Math.max(index, 0), LEVELS.length - 1)
  return LEVELS[clamped]!
}

/**
 * 某关开局：全体角色在左岸，船停左岸，船上为空。
 * @param levelIndex 0 起的关卡下标。
 */
export function createInitialState(levelIndex: number): RiverState {
  const level = levelFor(levelIndex)
  return {
    left: level.characters.map(c => c.id),
    right: [],
    boatSide: 'left',
    boat: [],
  }
}

/** 船停靠岸的角色列表（乘客仍留在该岸名单外，由船上名单表达）。 */
export function dockedBank(state: RiverState): string[] {
  return state.boatSide === 'left' ? state.left : state.right
}

/** 深拷贝辅助。 */
function clone(state: RiverState): RiverState {
  return { left: [...state.left], right: [...state.right], boatSide: state.boatSide, boat: [...state.boat] }
}

/**
 * 角色能否上船：必须停在角色所在岸，且船上还有空位。
 * @param state 当前状态。
 * @param level 关卡定义（提供席位数）。
 * @param id 角色 id。
 */
export function canBoard(state: RiverState, level: RiverLevel, id: string): boolean {
  if (state.boat.length >= level.passengerSlots) return false
  return dockedBank(state).includes(id)
}

/**
 * 角色上船（从停靠岸移入船舱）。
 * @returns 新状态；船上满员或角色不在停靠岸时返回 null，入参不被修改。
 */
export function board(state: RiverState, level: RiverLevel, id: string): RiverState | null {
  if (!canBoard(state, level, id)) return null
  const next = clone(state)
  const bank = next.boatSide === 'left' ? 'left' : 'right'
  next[bank] = next[bank].filter(c => c !== id)
  next.boat.push(id)
  return next
}

/**
 * 角色能否下船：只有船舱里的角色可以下船（回到停靠岸）。
 * @param id 角色 id。
 */
export function canDisembark(state: RiverState, id: string): boolean {
  return state.boat.includes(id)
}

/**
 * 角色下船（船舱移回停靠岸）。
 * @returns 新状态；角色不在船上时返回 null，入参不被修改。
 */
export function disembark(state: RiverState, id: string): RiverState | null {
  if (!canDisembark(state, id)) return null
  const next = clone(state)
  next.boat = next.boat.filter(c => c !== id)
  const bank = next.boatSide === 'left' ? 'left' : 'right'
  next[bank].push(id)
  return next
}

/**
 * 能否开船：船在岸边即可开（允许空船，农夫独自摆渡是经典解法的一步）。
 */
export function canCross(state: RiverState): boolean {
  void state
  return true
}

/**
 * 开船渡河：船翻转到对岸，乘客全部卸到对岸。方向由当前 boatSide 决定。
 * @returns 新状态（左岸 / 右岸名单与 boatSide 已更新）。
 */
export function cross(state: RiverState): RiverState {
  const next = clone(state)
  next.boatSide = state.boatSide === 'left' ? 'right' : 'left'
  const target = next.boatSide === 'left' ? 'left' : 'right'
  for (const id of next.boat) next[target].push(id)
  next.boat = []
  return next
}

/**
 * 岸上冲突判定：按关卡冲突表找出第一对同岸的捕食者 / 猎物。
 * @param level 关卡定义（冲突表）。
 * @param bank 岸上角色 id 列表。
 * @returns [捕食者, 猎物]；无冲突返回 null。
 */
export function bankConflict(level: RiverLevel, bank: readonly string[]): readonly [string, string] | null {
  for (const [pred, prey] of level.conflicts) {
    if (bank.includes(pred) && bank.includes(prey)) return [pred, prey]
  }
  return null
}

/** 局面判定结果。 */
export type RiverStatus =
  | { phase: 'playing' }
  | { phase: 'failed'; bank: Side; pair: readonly [string, string] }
  | { phase: 'won' }

/**
 * 判定当前局面：左岸清空即胜利（此时船必在右岸且已卸货）；船不在的岸
 * （无人看管）出现冲突对即失败，回报冲突对与事发岸。
 * @param state 当前状态。
 * @param level 关卡定义。
 */
export function evaluate(state: RiverState, level: RiverLevel): RiverStatus {
  if (state.left.length === 0 && state.boat.length === 0) return { phase: 'won' }
  const farSide: Side = state.boatSide === 'left' ? 'right' : 'left'
  const farBank = farSide === 'left' ? state.left : state.right
  const pair = bankConflict(level, farBank)
  if (pair !== null) return { phase: 'failed', bank: farSide, pair }
  return { phase: 'playing' }
}

/** BFS 搜索节点：左岸成员位图 + 船位。 */
interface BfsNode {
  mask: number
  side: Side
}

/**
 * BFS 求某关最少渡河次数（同时充当可解性证明）。
 * 农夫与船同体：从停靠岸选至多 passengerSlots 名乘客开船，离岸后原岸
 * 无人看管必须无冲突；对岸因农夫到达恒为安全。
 * @param levelIndex 0 起的关卡下标。
 * @returns 最少渡河次数；无解返回 -1。
 */
export function minCrossings(levelIndex: number): number {
  const level = levelFor(levelIndex)
  const ids = level.characters.map(c => c.id)
  const n = ids.length
  const indexOf = new Map(ids.map((id, i) => [id, i]))
  const bit = (id: string): number => 1 << indexOf.get(id)!
  const startMask = (1 << n) - 1
  // leftMask 掩码下的岸是否无冲突（无人看管时安全）。
  const safeLeft = new Array<boolean>(1 << n).fill(true)
  for (let mask = 0; mask < 1 << n; mask += 1) {
    for (const [pred, prey] of level.conflicts) {
      if ((mask & bit(pred)) !== 0 && (mask & bit(prey)) !== 0) safeLeft[mask] = false
    }
  }
  const seen = new Set<string>()
  let frontier: BfsNode[] = [{ mask: startMask, side: 'left' }]
  seen.add(startMask + ':left')
  let crossings = 0
  while (frontier.length > 0) {
    crossings += 1
    const next: BfsNode[] = []
    for (const node of frontier) {
      // 停靠岸成员位图：左停靠 = mask 本身；右停靠 = 全员减去左岸。
      const bankMask = node.side === 'left' ? node.mask : startMask & ~node.mask
      const bankIds = ids.filter((_, i) => (bankMask & (1 << i)) !== 0)
      const subsets: number[][] = [[]]
      for (const id of bankIds) {
        const b = bit(id)
        const size = subsets.length
        for (let k = 0; k < size; k += 1) subsets.push([...subsets[k]!, b])
      }
      for (const passengers of subsets) {
        if (passengers.length > level.passengerSlots) continue
        let take = 0
        for (const b of passengers) take |= b
        // 离岸后原岸剩余成员必须无冲突（对岸因农夫到达恒安全）。
        const remainMask = bankMask & ~take
        if (!safeLeft[remainMask]) continue
        const toSide: Side = node.side === 'left' ? 'right' : 'left'
        // 渡河后的左岸成员：向右运送则移出，向左带回则并入。
        const leftMask = node.side === 'left' ? remainMask : node.mask | take
        const key = leftMask + ':' + toSide
        if (seen.has(key)) continue
        seen.add(key)
        if (leftMask === 0) return crossings
        next.push({ mask: leftMask, side: toSide })
      }
    }
    frontier = next
  }
  return -1
}
