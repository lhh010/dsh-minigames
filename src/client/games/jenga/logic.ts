/**
 * 叠叠乐（Jenga）纯逻辑：3×3×N 层木塔，每层 3 块、相邻层正交。
 * 玩家点击抽出仍在位的木块；简化静力学——每块重量由 seed 确定
 * （mulberry32），抽出后其上方总重重新分配到该层剩余块上：
 *
 *   应力比 = W上方 / 支撑容量 + 偏心系数 × W上方 × d / 支撑容量
 *
 * 其中支撑容量 = 该层剩余块 fragility × 单块容量 之和，d 为上方
 * 质心到剩余支撑块质心的水平距离（等轴测 2D 投影距离）。任一层
 * 应力比 > 1 即塔倒（失败）。全部随机仅在 createTower 时消耗，
 * 同一 seed + 同一抽取序列必然得到同一结果，可脱离 DOM 验证。
 */

/** 每层块数（固定 3）。 */
export const SLOTS = 3
/** 单块承载容量（重量单位；乘以每块 fragility）。 */
export const CAP_PER_BLOCK = 7
/** 偏心力矩系数：质心偏移 1 单位距离的额外应力倍率。 */
export const ECCENTRICITY = 1.0
/** 关卡层数递进：第 1 关 5 层，每关 +1，最多 8 层。 */
export const MAX_STAGE = 4

/** 一块木块：level 从 1（底层）计，slot ∈ {-1,0,1}。 */
export interface JengaBlock {
  /** 所在层（1 = 底层）。 */
  level: number
  /** 层内位置：-1 / 0 / 1（0 为中块）。 */
  slot: number
  /** 是否仍在塔上。 */
  present: boolean
  /** 重量（0.75 ~ 1.25，seed 确定）。 */
  weight: number
  /** 脆弱度（0.85 ~ 1.15，作为该块所在层的容量乘数，seed 确定）。 */
  fragility: number
}

/** 塔状态：所有操作直接修改传入的 state（与 DOM 无关）。 */
export interface JengaState {
  /** 总层数。 */
  levels: number
  /** 按 (level-1)*3 + (slot+1) 索引的 3×N 块。 */
  blocks: JengaBlock[]
  /** 当前得分。 */
  score: number
  /** 已成功抽出块数。 */
  pulled: number
  /** playing 进行中 / collapsed 塔倒 / cleared 无块可抽收手。 */
  status: 'playing' | 'collapsed' | 'cleared'
}

/** 抽块结果。 */
export interface PullResult {
  /** 是否为合法抽取（非法点击直接忽略）。 */
  ok: boolean
  /** 本次抽取是否导致塔倒。 */
  collapsed: boolean
  /** 本次得分增量（塔倒为 0）。 */
  gained: number
}

/** mulberry32 确定性伪随机数发生器（返回 [0,1)）。 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 第 stage 关（1 起）的塔层数：5 层递增到 8 层。 */
export function levelCount(stage: number): number {
  return Math.min(4 + stage, 8)
}

/**
 * 生成初始塔：重量与脆弱度全部由 seed 确定，消耗顺序固定。
 * @param seed - 任意整数种子。
 * @param levels - 塔层数（levelCount 的结果）。
 */
export function createTower(seed: number, levels: number): JengaState {
  const rng = mulberry32(seed)
  const blocks: JengaBlock[] = []
  for (let level = 1; level <= levels; level += 1) {
    for (let slot = -1; slot <= 1; slot += 1) {
      blocks.push({
        level,
        slot,
        present: true,
        weight: 0.75 + rng() * 0.5,
        fragility: 0.85 + rng() * 0.3,
      })
    }
  }
  return { levels, blocks, score: 0, pulled: 0, status: 'playing' }
}

/** 取 (level, slot) 处的块；越界返回 null。 */
export function blockAt(state: JengaState, level: number, slot: number): JengaBlock | null {
  if (level < 1 || level > state.levels || slot < -1 || slot > 1) return null
  return state.blocks[(level - 1) * SLOTS + (slot + 1)] ?? null
}

/** 最高仍有块的层（0 表示空塔）。 */
function topLevel(state: JengaState): number {
  for (let level = state.levels; level >= 1; level -= 1) {
    if (state.blocks.some(b => b.level === level && b.present)) return level
  }
  return 0
}

/**
 * 抽块合法性：进行中、该块仍在位，且顶层满 3 块时不可抽顶层；
 * 顶层不满 3 块或非顶层均可抽（风险由静力学判定承担）。
 */
export function canPull(state: JengaState, level: number, slot: number): boolean {
  if (state.status !== 'playing') return false
  const block = blockAt(state, level, slot)
  if (block === null || !block.present) return false
  const top = topLevel(state)
  if (level === top) {
    const topCount = state.blocks.filter(b => b.level === top && b.present).length
    return topCount < SLOTS
  }
  return true
}

/** 块中心的等轴测平面坐标（层偶沿 X、奇沿 Z 正交）。 */
function blockPos(block: JengaBlock): { x: number, z: number } {
  return block.level % 2 === 0 ? { x: 0, z: block.slot } : { x: block.slot, z: 0 }
}

/**
 * 第 level 层的当前应力比（> 1 即该层失稳；空层上有重量为 ∞）。
 * 纯静态计算，不修改 state。
 */
export function stressOf(state: JengaState, level: number): number {
  const supports = state.blocks.filter(b => b.level === level && b.present)
  const above = state.blocks.filter(b => b.level > level && b.present)
  const cap = supports.reduce((sum, b) => sum + b.fragility * CAP_PER_BLOCK, 0)
  if (supports.length === 0) return above.length === 0 ? 0 : Infinity
  if (above.length === 0) return 0
  const w = above.reduce((sum, b) => sum + b.weight, 0)
  let cx = 0
  let cz = 0
  for (const b of above) {
    const p = blockPos(b)
    cx += b.weight * p.x
    cz += b.weight * p.z
  }
  cx /= w
  cz /= w
  let sx = 0
  let sz = 0
  for (const b of supports) {
    const p = blockPos(b)
    sx += p.x
    sz += p.z
  }
  sx /= supports.length
  sz /= supports.length
  const d = Math.hypot(cx - sx, cz - sz)
  return w / cap + ECCENTRICITY * w * d / cap
}

/**
 * 塔的最大应力比（诊断 / 渲染用）；空塔返回 0。
 */
export function towerStress(state: JengaState): number {
  let max = 0
  for (let level = 1; level <= state.levels; level += 1) {
    max = Math.max(max, stressOf(state, level))
  }
  return max
}

/**
 * 预览抽走 (level, slot) 后该层的应力比（不动 state）：渲染用它给
 * 悬空块标红——数值 > 1 表示抽出即倒。
 */
export function previewStress(state: JengaState, level: number, slot: number): number {
  const block = blockAt(state, level, slot)
  if (block === null || !block.present) return 0
  block.present = false
  const ratio = stressOf(state, level)
  block.present = true
  return ratio
}

/** 塔当前是否已失稳（任一层应力比 > 1）。 */
export function isCollapsed(state: JengaState): boolean {
  for (let level = 1; level <= state.levels; level += 1) {
    if (stressOf(state, level) > 1) return true
  }
  return false
}

/** 所有可抽块（点击提示 / 结束判定）。 */
export function legalPulls(state: JengaState): Array<{ level: number, slot: number }> {
  const out: Array<{ level: number, slot: number }> = []
  if (state.status !== 'playing') return out
  for (const b of state.blocks) {
    if (b.present && canPull(state, b.level, b.slot)) out.push({ level: b.level, slot: b.slot })
  }
  return out
}

/**
 * 安全可抽块：抽出后其所在层应力比 ≤ 1 的可抽块。全部可抽块都
 * 不安全（一抽就倒）时玩家只能收手——这是通关（cleared）判定。
 */
export function safePulls(state: JengaState): Array<{ level: number, slot: number }> {
  return legalPulls(state).filter(m => previewStress(state, m.level, m.slot) <= 1)
}

/** 抽某层的得分：层越低（越接近塔底）风险越高、分越多。 */
export function scoreFor(levels: number, level: number): number {
  return 10 + (levels - level) * 5
}

/**
 * 抽出 (level, slot)：非法点击原样拒绝；合法则移除该块并做全局
 * 稳定性判定——塔倒置 status='collapsed' 且不得分；未倒则按层计分，
 * 且已无任何可抽块或安全可抽块时置 status='cleared'（只能收手）。
 */
export function pull(state: JengaState, level: number, slot: number): PullResult {
  if (!canPull(state, level, slot)) return { ok: false, collapsed: false, gained: 0 }
  const block = blockAt(state, level, slot)
  block!.present = false
  if (isCollapsed(state)) {
    state.status = 'collapsed'
    return { ok: true, collapsed: true, gained: 0 }
  }
  const gained = scoreFor(state.levels, level)
  state.score += gained
  state.pulled += 1
  if (legalPulls(state).length === 0 || safePulls(state).length === 0) state.status = 'cleared'
  return { ok: true, collapsed: false, gained }
}
