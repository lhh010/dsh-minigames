/**
 * Boss 移动大脑：分帧候选评估。把机动区划成固定网格（8 列 x 3 行 = 24
 * 个候选点），每个评估周期内每帧最多评估 AI_BUDGET_PER_FRAME 个候选
 * （危险度 = 附近敌弹迫近惩罚 + 远离玩家的跟踪惩罚），扫描完成后择优
 * 提交为驻留目标，驻留一段固定时间后重新开始扫描。因此单帧计算量有
 * 硬上限，绝不在一帧内算完整轮搜索；扫描顺序固定，无随机数，同局面
 * 结果完全确定。
 */
import type { DanmakuState } from './logic.ts'
import { W, type BossBrainLike } from './logic.ts'

/** 每帧最多评估的候选点数（单帧计算硬上限）。 */
export const AI_BANDWIDTH_PER_FRAME = 6
/** 候选网格：8 列 x 3 行。 */
export const GRID_COLS = 8
export const GRID_ROWS = 3
/** 候选网格总点数。 */
export const GRID_SIZE = GRID_COLS * GRID_ROWS
/** 候选 y 分布（画布纵向上的三行）。 */
const GRID_Y = [96, 150, 204]
/** 单次驻留 ms（驻留结束后重新扫描）。 */
export const DWELL_MS = 900
/** 危险度统计半径 px。 */
const DANGER_R = 150

/** 大脑运行时状态（实现 logic 的 BossBrainLike 接口）。 */
export interface BossBrain extends BossBrainLike {
  /** 扫描进度：下一个待评估候选下标。 */
  scanIndex: number
  /** 本轮已评估数。 */
  evaluated: number
  /** 当前最优分与候选下标。 */
  bestScore: number
  bestIndex: number
  /** 驻留剩余 ms；>0 时目标保持不变。 */
  dwellMs: number
  /** 是否正处在扫描中。 */
  scanning: boolean
}

/** 候选下标 → 坐标（列均布、三行固定 y）。 */
export function candidateAt(index: number): { x: number, y: number } {
  const col = index % GRID_COLS
  const row = Math.floor(index / GRID_COLS)
  return { x: 44 + (col * (W - 88)) / (GRID_COLS - 1), y: GRID_Y[Math.min(row, GRID_ROWS - 1)]! }
}

/**
 * 单个候选点的危险度评估：越低越好。敌弹迫近惩罚 + 远离玩家横向惩罚 +
 * 顶行惩罚（贴顶减少压迫感）。
 * @param x - 候选点 x。
 * @param y - 候选点 y。
 * @param state - 当前局面。
 * @returns 危险度（可为负）。
 */
export function evaluateCandidate(x: number, y: number, state: DanmakuState): number {
  let danger = 0
  for (const b of state.enemyBullets) {
    const d = Math.hypot(b.x - x, b.y - y)
    if (d < DANGER_R) danger += DANGER_R - d
  }
  danger += Math.abs(x - state.playerX) * 0.4
  if (y < GRID_Y[0]! + 1) danger += 80
  return danger
}

/**
 * 造一个大脑（初始目标为屏幕中上方，立即进入扫描）。
 * @returns 大脑运行时。
 */
export function createBossBrain(): BossBrain {
  return {
    scanIndex: 0,
    evaluated: 0,
    bestScore: Number.POSITIVE_INFINITY,
    bestIndex: 0,
    dwellMs: 0,
    scanning: true,
    targetX: candidateAt(0).x,
    targetY: GRID_Y[1]!,
    step(state, dtMs): void {
      if (this.dwellMs > 0) {
        this.dwellMs = Math.max(0, this.dwellMs - dtMs)
        if (this.dwellMs > 0) return
      }
      if (!this.scanning) {
        this.scanning = true
        this.scanIndex = 0
        this.evaluated = 0
        this.bestScore = Number.POSITIVE_INFINITY
        this.bestIndex = 0
      }
      // 每帧只评估固定量候选：分帧硬限额。
      let used = 0
      while (this.scanIndex < GRID_SIZE && used < AI_BANDWIDTH_PER_FRAME) {
        const c = candidateAt(this.scanIndex)
        const score = evaluateCandidate(c.x, c.y, state)
        // 同分取先扫到者（扫描顺序固定，确定性）。
        if (score < this.bestScore) {
          this.bestScore = score
          this.bestIndex = this.scanIndex
        }
        this.scanIndex += 1
        this.evaluated += 1
        used += 1
      }
      if (this.scanIndex >= GRID_SIZE) {
        const best = candidateAt(this.bestIndex)
        this.targetX = best.x
        this.targetY = best.y
        this.scanning = false
        this.dwellMs = DWELL_MS
      }
    },
  }
}
