/**
 * 天平谜题 Balance 纯逻辑：一根中心支点横梁，左右各 5 个挂点（距支点
 * 1-5 单位）。全部砝码挂上后左力矩和等于右力矩和即过关。仅含确定性
 * 纯函数——无 DOM、无定时器；随机性全部经由注入的 rng（mulberry32）。
 */

/** 每侧挂点数（距支点 1..SLOTS_PER_SIDE 单位）。 */
export const SLOTS_PER_SIDE = 5
/** 总挂点数：左 5 + 右 5，0..4 为左侧（距离 5..1），5..9 为右侧（距离 1..5）。 */
export const SLOT_COUNT = SLOTS_PER_SIDE * 2
/** 每关砝码数（关卡 1..5 递进：3 → 7）。 */
export const LEVEL_WEIGHTS = [3, 4, 5, 6, 7]

/** 一局棋面：weights 按砝码下标给出数值（1-9），placement 给出所在挂点（-1 = 未挂）。 */
export interface BalanceState {
  weights: number[]
  placement: number[]
}

/** 一个关卡：砝码数值与构造时保证存在的一组解（每个砝码的挂点）。 */
export interface BalanceLevel {
  weights: number[]
  /** 解：solution[砝码下标] = 挂点下标，按此挂满恰好平衡。 */
  solution: number[]
}

/**
 * mulberry32 确定性伪随机数生成器：返回 [0,1) 的函数，同种子同序列。
 * @param seed - 非负整数种子。
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 挂点所在的侧与力臂：0..4 为左（力臂 5..1），5..9 为右（力臂 1..5）。 */
export function slotArm(slot: number): { side: 'L' | 'R', distance: number } {
  if (slot < SLOTS_PER_SIDE) return { side: 'L', distance: SLOTS_PER_SIDE - slot }
  return { side: 'R', distance: slot - SLOTS_PER_SIDE + 1 }
}

/** 左力矩和：已挂在左侧的 砝码数值 × 力臂 之和。 */
export function leftTorque(state: BalanceState): number {
  let sum = 0
  for (let i = 0; i < state.weights.length; i += 1) {
    const slot = state.placement[i]!
    if (slot >= 0 && slot < SLOTS_PER_SIDE) sum += state.weights[i]! * slotArm(slot).distance
  }
  return sum
}

/** 右力矩和：已挂在右侧的 砝码数值 × 力臂 之和。 */
export function rightTorque(state: BalanceState): number {
  let sum = 0
  for (let i = 0; i < state.weights.length; i += 1) {
    const slot = state.placement[i]!
    if (slot >= SLOTS_PER_SIDE) sum += state.weights[i]! * slotArm(slot).distance
  }
  return sum
}

/** 净力矩：左 - 右；正数左沉，负数右沉，0 恰平衡。 */
export function netTorque(state: BalanceState): number {
  return leftTorque(state) - rightTorque(state)
}

/** 是否全部砝码均已挂上。 */
export function allPlaced(state: BalanceState): boolean {
  return state.placement.every(slot => slot >= 0)
}

/** 过关判定：全部挂上且净力矩为 0。 */
export function isWin(state: BalanceState): boolean {
  return allPlaced(state) && netTorque(state) === 0
}

/** 开局：给定砝码数值，全部置于砝码架（未挂）。 */
export function createStart(weights: number[]): BalanceState {
  return { weights: [...weights], placement: weights.map(() => -1) }
}

/** 占用情况：occupants[挂点] = 砝码下标，-1 = 空。 */
export function occupants(state: BalanceState): number[] {
  const result: number[] = new Array(SLOT_COUNT).fill(-1)
  for (let i = 0; i < state.placement.length; i += 1) {
    const slot = state.placement[i]!
    if (slot >= 0) result[slot] = i
  }
  return result
}

/**
 * 把砝码 wi 挂到挂点 slot。
 * @returns 新状态；wi 越界、已挂上、slot 越界或已被占用时返回 null。不改动原状态。
 */
export function placeWeight(state: BalanceState, wi: number, slot: number): BalanceState | null {
  if (wi < 0 || wi >= state.weights.length) return null
  if (slot < 0 || slot >= SLOT_COUNT) return null
  if (state.placement[wi]! >= 0) return null
  if (occupants(state)[slot]! >= 0) return null
  const placement = [...state.placement]
  placement[wi] = slot
  return { weights: [...state.weights], placement }
}

/**
 * 取下已挂上的砝码 wi 放回砝码架。
 * @returns 新状态；wi 越界或本来未挂时返回 null。不改动原状态。
 */
export function removeWeight(state: BalanceState, wi: number): BalanceState | null {
  if (wi < 0 || wi >= state.weights.length) return null
  if (state.placement[wi]! < 0) return null
  const placement = [...state.placement]
  placement[wi] = -1
  return { weights: [...state.weights], placement }
}

/** 随机取 [min,max] 闭区间整数。 */
function randInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1))
}

/**
 * 生成一个保证恰好可解的关卡（构造解反推）：先把前 count-1 个砝码随机
 * 挂到随机挂点上，得到左右力矩差 diff（diff 为 0 时重试）；再用最后一
 * 个砝码补平——在较轻一侧找一个空闲挂点 d，使 diff 能被 d 整除且商在
 * 1..9。找不到则整体重试，重试上限后回退到确定性可解组。
 * @param rng - 注入的 [0,1) 随机源（如 mulberry32(seed)）。
 * @param count - 砝码数（1..10）。
 * @returns 砝码数值与其一组平衡解；同 rng 序列结果确定。
 */
export function generateLevel(rng: () => number, count: number): BalanceLevel {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const weights: number[] = []
    const solution: number[] = []
    const used = new Array<boolean>(SLOT_COUNT).fill(false)
    let left = 0
    let right = 0
    let ok = true
    for (let i = 0; i < count - 1; i += 1) {
      const value = randInt(rng, 1, 9)
      const slot = randInt(rng, 0, SLOT_COUNT - 1)
      if (used[slot]!) { ok = false; break }
      used[slot] = true
      weights.push(value)
      solution.push(slot)
      const arm = slotArm(slot)
      if (arm.side === 'L') left += value * arm.distance
      else right += value * arm.distance
    }
    if (!ok) continue
    const diff = Math.abs(left - right)
    if (diff === 0) continue // 最后一个砝码单侧必失衡，重试
    const lightSideFirst = left < right ? 0 : SLOTS_PER_SIDE
    let placed = false
    for (let k = 0; k < SLOTS_PER_SIDE && !placed; k += 1) {
      const slot = lightSideFirst + k
      const distance = slotArm(slot).distance
      if (used[slot]!) continue
      if (diff % distance !== 0) continue
      const value = diff / distance
      if (value < 1 || value > 9) continue
      weights.push(value)
      solution.push(slot)
      placed = true
    }
    if (!placed) continue
    // 打乱输出顺序（解仍按砝码下标对应）。
    const order = weights.map((_, i) => i)
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1))
      const tmp = order[i]!
      order[i] = order[j]!
      order[j] = tmp
    }
    const shuffled = order.map(i => weights[i]!)
    const shuffledSolution = order.map(i => solution[i]!)
    return { weights: shuffled, solution: shuffledSolution }
  }
  // 回退：确定性可解。奇数先用平衡三元组 3@左1 = 1@右1 + 1@右2，其余
  // 用同值同臂对挂（v@左d + v@右d），任意 count >= 3 均可凑出且挂点不撞。
  const used = new Array<boolean>(SLOT_COUNT).fill(false)
  const fallback: number[] = []
  const fallbackSolution: number[] = []
  let remaining = count
  if (remaining % 2 === 1) {
    for (const [value, slot] of [[3, SLOTS_PER_SIDE - 1], [1, SLOTS_PER_SIDE], [1, SLOTS_PER_SIDE + 1]] as const) {
      used[slot] = true
      fallback.push(value)
      fallbackSolution.push(slot)
    }
    remaining -= 3
  }
  while (remaining >= 2) {
    const value = (fallback.length % 9) + 1
    let booked = false
    for (let d = 1; d <= SLOTS_PER_SIDE && !booked; d += 1) {
      const leftSlot = SLOTS_PER_SIDE - d
      const rightSlot = SLOTS_PER_SIDE + d - 1
      if (used[leftSlot]! || used[rightSlot]!) continue
      used[leftSlot] = true
      used[rightSlot] = true
      fallback.push(value, value)
      fallbackSolution.push(leftSlot, rightSlot)
      booked = true
    }
    if (!booked) break
    remaining -= 2
  }
  return { weights: fallback, solution: fallbackSolution }
}

/** 关卡 seed 派生：同一基础种子下每关固定不同。 */
export function levelSeed(baseSeed: number, level: number): number {
  return (baseSeed + level * 7919) >>> 0
}
