/**
 * 齿轮谜题 (Gears) 纯逻辑：关卡布局生成（固定骨架 + 注入随机只撒障碍）、
 * 网格邻接（上下左右即啮合）、从动力轮出发的 BFS 传动分析（相邻必反转、
 * 转速按齿数比连乘）、每个目标轮的方向/转速达标判定、放置与收回齿轮、
 * 过关计分与关卡推进。全部随机走注入 seed（mulberry32），确定性可测；
 * 无 DOM、无定时器。
 */

/** 网格坐标：r 行（向下增长），c 列（向右增长）。 */
export interface Cell {
  r: number
  c: number
}

/** 目标轮的方向要求：顺时针 / 逆时针 / 任意。 */
export type DirReq = 'cw' | 'ccw' | 'any'

/** 一格的种类：障碍 / 空位 / 动力轮 / 目标轮。 */
export type CellKind = 'void' | 'empty' | 'motor' | 'target'

/** 一个目标轮：位置与齿数固定，附带方向与最低转速要求。 */
export interface OutputReq {
  pos: Cell
  teeth: number
  /** 'cw' 与动力轮同向，'ccw' 反向，'any' 不限。 */
  dir: DirReq
  /** 最低转速（°/s）；0 表示不考核转速。 */
  minSpeed: number
}

/** 生成一关所需的全部 authored 骨架信息。 */
export interface LevelDef {
  w: number
  h: number
  motor: Cell
  motorTeeth: number
  outputs: OutputReq[]
  /** 保底走廊：这些空位永不撒成障碍，通关路径恒存在。 */
  corridor: Cell[]
  /** 非走廊、非固定格被撒成障碍的概率。 */
  voidChance: number
}

/** 一关的完整盘面。 */
export interface GearsLevel {
  w: number
  h: number
  cells: CellKind[][]
  motor: Cell
  motorTeeth: number
  outputs: OutputReq[]
}

/** 备用齿轮槽的候选齿数（下标即槽位）。 */
export const CANDIDATE_TEETH: readonly number[] = [8, 12, 16, 24]

/** 动力轮角速度（°/s），顺时针为正。 */
export const MOTOR_SPEED = 60

/** 过关基础分（乘以关卡号）。 */
export const WIN_BASE = 100
/** 每用一个齿轮扣的分（效率奖励下限 0）。 */
export const GEAR_COST = 20
/** 效率奖励上限。 */
export const BONUS_MAX = 200

export type GearsStatus = 'playing' | 'won'

export interface GearsState {
  /** 1-based 关卡号。 */
  level: number
  score: number
  /** 进入本关时的得分（R 重开时回滚到它，防止反复刷分）。 */
  levelStartScore: number
  status: GearsStatus
  /** 布局种子：同 seed 同关卡必生成同布局。 */
  seed: number
  board: GearsLevel
  /** placed[r][c]：空位上已放齿轮的齿数，null 为空。 */
  placed: (number | null)[][]
  /** 当前选中的候选槽下标（CANDIDATE_TEETH 索引）。 */
  selected: number
  /** 放置/收回操作计数。 */
  moves: number
}

/** mulberry32 确定性伪随机数发生器：同 seed 同序列，返回 [0,1)。 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 关卡种子：不同 seed / 不同关卡号产生不同的布局序列。 */
export function levelSeed(seed: number, level: number): number {
  return (Math.imul(seed >>> 0, 374761393) + Math.imul(level, 668265263)) >>> 0
}

/** 5 关递进：走廊变长、障碍变密、方向/转速要求逐步登场。 */
export const LEVEL_DEFS: LevelDef[] = [
  {
    w: 5, h: 4, motor: { r: 1, c: 0 }, motorTeeth: 12,
    outputs: [{ pos: { r: 1, c: 4 }, teeth: 12, dir: 'any', minSpeed: 0 }],
    corridor: [{ r: 1, c: 1 }, { r: 1, c: 2 }, { r: 1, c: 3 }],
    voidChance: 0.12,
  },
  {
    w: 5, h: 4, motor: { r: 0, c: 0 }, motorTeeth: 12,
    outputs: [{ pos: { r: 3, c: 4 }, teeth: 8, dir: 'ccw', minSpeed: 0 }],
    corridor: [{ r: 0, c: 1 }, { r: 1, c: 1 }, { r: 2, c: 1 }, { r: 3, c: 1 }, { r: 3, c: 2 }, { r: 3, c: 3 }],
    voidChance: 0.2,
  },
  {
    w: 6, h: 5, motor: { r: 2, c: 0 }, motorTeeth: 16,
    outputs: [{ pos: { r: 3, c: 5 }, teeth: 8, dir: 'cw', minSpeed: 0 }],
    corridor: [{ r: 2, c: 1 }, { r: 3, c: 1 }, { r: 3, c: 2 }, { r: 3, c: 3 }, { r: 3, c: 4 }],
    voidChance: 0.25,
  },
  {
    w: 6, h: 5, motor: { r: 2, c: 0 }, motorTeeth: 12,
    outputs: [
      { pos: { r: 1, c: 5 }, teeth: 8, dir: 'cw', minSpeed: 0 },
      { pos: { r: 4, c: 5 }, teeth: 16, dir: 'ccw', minSpeed: 0 },
    ],
    corridor: [
      { r: 2, c: 1 }, { r: 1, c: 1 }, { r: 1, c: 2 }, { r: 1, c: 3 }, { r: 1, c: 4 },
      { r: 3, c: 1 }, { r: 4, c: 1 }, { r: 4, c: 2 }, { r: 4, c: 3 }, { r: 4, c: 4 },
    ],
    voidChance: 0.3,
  },
  {
    w: 7, h: 6, motor: { r: 2, c: 0 }, motorTeeth: 16,
    outputs: [{ pos: { r: 3, c: 6 }, teeth: 12, dir: 'ccw', minSpeed: 40 }],
    corridor: [{ r: 2, c: 1 }, { r: 2, c: 2 }, { r: 2, c: 3 }, { r: 3, c: 3 }, { r: 3, c: 4 }, { r: 3, c: 5 }],
    voidChance: 0.35,
  },
]

/**
 * 按 authored 骨架生成一关：走廊与固定格保留，其余空格按 voidChance 撒障碍。
 * 走廊恒为空位，故每关必然可解。
 * @param def - 关卡骨架。
 * @param rng - 注入随机源。
 */
export function buildLevel(def: LevelDef, rng: () => number): GearsLevel {
  const cells: CellKind[][] = Array.from({ length: def.h }, () =>
    Array.from({ length: def.w }, () => 'empty' as CellKind))
  for (const cell of def.corridor) cells[cell.r]![cell.c] = 'empty'
  cells[def.motor.r]![def.motor.c] = 'motor'
  for (const out of def.outputs) cells[out.pos.r]![out.pos.c] = 'target'
  const fixed = (r: number, c: number): boolean => {
    const kind = cells[r]![c]!
    return kind === 'motor' || kind === 'target'
  }
  const onCorridor = (r: number, c: number): boolean =>
    def.corridor.some(cell => cell.r === r && cell.c === c)
  for (let r = 0; r < def.h; r += 1) {
    for (let c = 0; c < def.w; c += 1) {
      if (fixed(r, c) || onCorridor(r, c)) continue
      if (rng() < def.voidChance) cells[r]![c] = 'void'
    }
  }
  return { w: def.w, h: def.h, cells, motor: def.motor, motorTeeth: def.motorTeeth, outputs: def.outputs }
}

/** 生成第 level 关（1-based；越界钳到 1..5）。 */
export function generateLevel(level: number, rng: () => number): GearsLevel {
  const clamped = Math.min(LEVEL_DEFS.length, Math.max(1, level))
  return buildLevel(LEVEL_DEFS[clamped - 1]!, rng)
}

/** (r,c) 的上下左右在界内邻格。 */
export function neighbors(r: number, c: number, w: number, h: number): Cell[] {
  const out: Cell[] = []
  if (r > 0) out.push({ r: r - 1, c })
  if (r < h - 1) out.push({ r: r + 1, c })
  if (c > 0) out.push({ r, c: c - 1 })
  if (c < w - 1) out.push({ r, c: c + 1 })
  return out
}

/** (r,c) 处齿轮的齿数：动力轮/目标轮取固定值，空位取放置值。 */
export function teethAt(level: GearsLevel, placed: (number | null)[][], r: number, c: number): number {
  const kind = level.cells[r]![c]!
  if (kind === 'motor') return level.motorTeeth
  if (kind === 'target') {
    const out = level.outputs.find(o => o.pos.r === r && o.pos.c === c)
    return out !== undefined ? out.teeth : 12
  }
  return placed[r]![c] ?? 0
}

/** 一枚被传动齿轮的解析结果：方向（1 顺时针 / -1 逆时针）与转速 °/s。 */
export interface Spin {
  dir: 1 | -1
  speed: number
}

/**
 * 从动力轮 BFS 求传动：网格相邻即啮合，相邻必反转，转速按
 * 齿数比连乘（子轮 = 父轮转速 × 父齿数 / 子齿数）。无齿轮的格不参与。
 * @returns 与盘面同形的 Spin | null 矩阵；null 表示该格未被传动。
 */
export function computeTransmission(
  level: GearsLevel, placed: (number | null)[][],
): (Spin | null)[][] {
  const info: (Spin | null)[][] = Array.from({ length: level.h }, () =>
    Array.from({ length: level.w }, () => null))
  const hasGear = (r: number, c: number): boolean => {
    const kind = level.cells[r]![c]!
    return kind === 'motor' || kind === 'target' || placed[r]![c] !== null
  }
  const motor = level.motor
  info[motor.r]![motor.c] = { dir: 1, speed: MOTOR_SPEED }
  const queue: Cell[] = [motor]
  while (queue.length > 0) {
    const cur = queue.shift()!
    const from = info[cur.r]![cur.c]!
    const fromTeeth = teethAt(level, placed, cur.r, cur.c)
    for (const next of neighbors(cur.r, cur.c, level.w, level.h)) {
      if (info[next.r]![next.c] !== null) continue
      if (!hasGear(next.r, next.c)) continue
      const toTeeth = teethAt(level, placed, next.r, next.c)
      info[next.r]![next.c] = {
        dir: from.dir === 1 ? -1 : 1,
        speed: (from.speed * fromTeeth) / toTeeth,
      }
      queue.push(next)
    }
  }
  return info
}

/** 一个目标轮的考核结果。 */
export interface OutputCheck {
  powered: boolean
  /** 传动到的方向（powered 时有效）。 */
  dir: 1 | -1
  /** 传动到的转速（powered 时有效）。 */
  speed: number
  /** 连通且方向、转速全部达标。 */
  met: boolean
}

/** 考核一个目标轮：连通、方向要求、转速阈值。 */
export function checkOutput(
  level: GearsLevel, placed: (number | null)[][], output: OutputReq,
): OutputCheck {
  const info = computeTransmission(level, placed)
  const spin = info[output.pos.r]![output.pos.c]!
  if (spin === null) return { powered: false, dir: 1, speed: 0, met: false }
  const want = output.dir === 'cw' ? 1 : output.dir === 'ccw' ? -1 : 0
  const dirOk = want === 0 || spin.dir === want
  const speedOk = output.minSpeed <= 0 || spin.speed + 1e-9 >= output.minSpeed
  return { powered: true, dir: spin.dir, speed: spin.speed, met: dirOk && speedOk }
}

/** 盘面上已放置的齿轮总数。 */
export function gearsUsed(placed: (number | null)[][]): number {
  let n = 0
  for (const row of placed) for (const v of row) if (v !== null) n += 1
  return n
}

/** 过关得分：基础分 × 关卡号 + 用轮效率奖励。 */
export function winScore(level: number, usedGears: number): number {
  return WIN_BASE * level + Math.max(0, BONUS_MAX - GEAR_COST * usedGears)
}

/**
 * 在空位放置一枚 selected 槽齿数的齿轮（重复放置即换齿数）。
 * @returns 放置成功返回 true；障碍格、固定格或暂停/过关态返回 false。
 */
export function placeGear(state: GearsState, r: number, c: number, teeth: number): boolean {
  if (state.status !== 'playing') return false
  const level = state.board
  if (r < 0 || r >= level.h || c < 0 || c >= level.w) return false
  if (level.cells[r]![c] !== 'empty') return false
  state.placed[r]![c] = teeth
  state.moves += 1
  return true
}

/** 收回 (r,c) 上已放置的齿轮。 */
export function removeGear(state: GearsState, r: number, c: number): boolean {
  if (state.status !== 'playing') return false
  const level = state.board
  if (r < 0 || r >= level.h || c < 0 || c >= level.w) return false
  if (state.placed[r]![c] === null) return false
  state.placed[r]![c] = null
  state.moves += 1
  return true
}

/**
 * 过关判定：所有目标轮 met 时置 'won' 并加分（只加一次）。
 * @returns playing→won 转换返回 true。
 */
export function checkWin(state: GearsState): boolean {
  if (state.status !== 'playing') return false
  const allMet = state.board.outputs.every(o => checkOutput(state.board, state.placed, o).met)
  if (!allMet) return false
  state.status = 'won'
  state.score += winScore(state.level, gearsUsed(state.placed))
  return true
}

/** 空的放置矩阵（换关 / 重开时重建）。 */
export function initPlaced(level: GearsLevel): (number | null)[][] {
  return Array.from({ length: level.h }, () => Array.from({ length: level.w }, () => null))
}

/** 过关后进入下一关：布局按种子重生成，分数与 levelStartScore 结转。 */
export function advanceLevel(state: GearsState): void {
  if (state.status !== 'won') return
  state.level += 1
  state.board = generateLevel(state.level, mulberry32(levelSeed(state.seed, state.level)))
  state.placed = initPlaced(state.board)
  state.status = 'playing'
  state.moves = 0
  state.levelStartScore = state.score
}

/** 重开本关：同一布局（同 seed 同关卡），分数回滚到进关时。 */
export function restartLevel(state: GearsState): void {
  state.board = generateLevel(state.level, mulberry32(levelSeed(state.seed, state.level)))
  state.placed = initPlaced(state.board)
  state.status = 'playing'
  state.score = state.levelStartScore
  state.moves = 0
}

/**
 * 新建一关状态。
 * @param level - 1-based 关卡号。
 * @param score - 结转得分。
 * @param seed - 布局种子。
 */
export function createGearsState(level = 1, score = 0, seed = 0x9ea25): GearsState {
  const board = generateLevel(level, mulberry32(levelSeed(seed, level)))
  return {
    level,
    score,
    levelStartScore: score,
    status: 'playing',
    seed,
    board,
    placed: initPlaced(board),
    selected: 0,
    moves: 0,
  }
}
