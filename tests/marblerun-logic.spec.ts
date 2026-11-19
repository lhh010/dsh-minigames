import { describe, expect, it } from 'vitest'
import {
  LEVELS,
  MARBLE_R,
  PIECE_ORIENTATIONS,
  createBoard,
  createRun,
  mulberry32,
  pieceAt,
  placePiece,
  removePieceAt,
  rotatePieceAt,
  scoreFor,
  simulate,
  stepRun,
  totalPieces,
  undo,
  type LevelDef,
  type PieceKind,
  type Placement,
} from '../src/client/games/marblerun/logic.ts'

const S = (x: number, y: number, rot = 0): Placement => ({ x, y, kind: 'straight', rot })
const B = (x: number, y: number, rot = 0): Placement => ({ x, y, kind: 'booster', rot })
const K = (x: number, y: number, rot = 0): Placement => ({ x, y, kind: 'bumper', rot })

/** 测试用迷你关卡：物理单元测试只需覆盖少数字段。 */
const mini = (over: Partial<LevelDef> = {}): LevelDef => ({
  name: '测试关',
  seed: 7,
  spawnX: 30, spawnY: 24, spawnVX: 90,
  cupX: 19, cupY: 11,
  spikes: [],
  inventory: { straight: 0, curveL: 0, curveR: 0, booster: 0, bumper: 0 },
  reference: [],
  ...over,
})

/** 推进到滚珠中心横坐标首次越过 targetX，返回此刻速度；未越过返回 -1。 */
const speedAtX = (level: LevelDef, placements: Placement[], targetX: number): number => {
  const w = createRun(level, placements)
  while (w.outcome === 'running' && w.time < 10) {
    if (w.px >= targetX) return Math.hypot(w.vx, w.vy)
    stepRun(w, 1 / 240)
  }
  return -1
}

describe('marblerun logic', () => {
  it('关卡模板五关递进：杯距更远、库存收紧到恰好、后期加尖刺', () => {
    expect(LEVELS).toHaveLength(5)
    const cupXs = LEVELS.map(l => l.cupX)
    expect(cupXs).toEqual([...cupXs].sort((a, b) => a - b))
    expect(LEVELS[0]!.spikes).toHaveLength(0)
    expect(LEVELS[1]!.spikes).toHaveLength(0)
    expect(LEVELS[2]!.spikes.length).toBeGreaterThan(0)
    expect(LEVELS[4]!.spikes.length).toBeGreaterThan(LEVELS[2]!.spikes.length)
    // L1 有富余（容错），L4/L5 库存与参考用量恰好相等（每块板都必须用上）。
    expect(totalPieces(LEVELS[0]!.inventory)).toBeGreaterThan(LEVELS[0]!.reference.length)
    expect(totalPieces(LEVELS[3]!.inventory)).toBe(LEVELS[3]!.reference.length)
    expect(totalPieces(LEVELS[4]!.inventory)).toBe(LEVELS[4]!.reference.length)
    // 参考搭法只使用关卡拥有的库存。
    for (const level of LEVELS) {
      expect(level.reference.length).toBeLessThanOrEqual(totalPieces(level.inventory))
    }
  })

  it('mulberry32：同种子同序列，异种子异序列', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    const c = mulberry32(43)
    const seqA = [a(), a(), a()]
    const seqB = [b(), b(), b()]
    const seqC = [c(), c(), c()]
    expect(seqA).toEqual(seqB)
    expect(seqA).not.toEqual(seqC)
    for (const v of [...seqA, ...seqC]) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('放置合法性：网格外 / 封锁格 / 占用 / 库存不足拒绝，成功记账', () => {
    const board = createBoard(0)
    // 出珠口 (0,0) 与杯格 (6,6) 都是封锁格。
    expect(placePiece(board, 0, 0, 'straight', 0)).toBe('blocked')
    expect(placePiece(board, 6, 6, 'straight', 0)).toBe('blocked')
    expect(placePiece(board, 99, 99, 'straight', 0)).toBe('grid')
    expect(placePiece(board, -1, 3, 'straight', 0)).toBe('grid')
    // 无库存件种拒绝。
    expect(placePiece(board, 3, 1, 'bumper', 0)).toBe('inventory')
    // 合法放置扣一件库存。
    expect(placePiece(board, 1, 1, 'straight', 1)).toBeNull()
    expect(board.inventory.straight).toBe(6)
    expect(board.placements).toHaveLength(1)
    // 同格重复拒绝。
    expect(placePiece(board, 1, 1, 'straight', 0)).toBe('occupied')
  })

  it('移回库存与旋转：返还计数、档位按件种取模循环', () => {
    const board = createBoard(1)
    expect(placePiece(board, 2, 2, 'straight', 0)).toBeNull()
    expect(placePiece(board, 3, 3, 'curveL', 0)).toBeNull()
    expect(pieceAt(board, 2, 2)).toBe(0)
    expect(pieceAt(board, 9, 9)).toBe(-1)
    // 直板 3 档循环：0 → 1 → 2 → 0。
    expect(rotatePieceAt(board, 2, 2)).toBe(true)
    expect(rotatePieceAt(board, 2, 2)).toBe(true)
    expect(rotatePieceAt(board, 2, 2)).toBe(true)
    expect(board.placements[0]!.rot).toBe(0)
    expect(PIECE_ORIENTATIONS.straight).toBe(3)
    // 旋转空格与移回空格都无效。
    expect(rotatePieceAt(board, 8, 8)).toBe(false)
    expect(removePieceAt(board, 8, 8)).toBe(false)
    expect(removePieceAt(board, 2, 2)).toBe(true)
    expect(board.inventory.straight).toBe(8)
    expect(board.placements).toHaveLength(1)
  })

  it('撤回栈：放置 / 移回逐步可逆，空栈返回 false', () => {
    const board = createBoard(0)
    placePiece(board, 1, 1, 'straight', 0)
    placePiece(board, 2, 2, 'straight', 1)
    removePieceAt(board, 1, 1)
    expect(board.inventory.straight).toBe(6)
    expect(board.placements).toHaveLength(1)
    expect(undo(board)).toBe(true)
    expect(board.placements).toHaveLength(2)
    expect(board.inventory.straight).toBe(5)
    expect(undo(board)).toBe(true)
    expect(undo(board)).toBe(true)
    expect(board.placements).toHaveLength(0)
    expect(board.inventory.straight).toBe(7)
    expect(board.history).toHaveLength(0)
    expect(undo(board)).toBe(false)
  })

  it('斜坡物理：滚珠贴线下滑，重力做功使速度持续增大', () => {
    const level = mini({ spawnX: 40, spawnY: 34, spawnVX: 40 })
    const pieces = [S(1, 1, 1), S(2, 2, 1), S(3, 3, 1)]
    const w = createRun(level, pieces)
    let maxSpeed = 0
    while (w.outcome === 'running' && w.time < 4) {
      stepRun(w, 0.05)
      maxSpeed = Math.max(maxSpeed, Math.hypot(w.vx, w.vy))
    }
    // 沿三条连续斜板滑到 (144,144) 之外，且速度远超初速 40。
    expect(w.px).toBeGreaterThan(120)
    expect(maxSpeed).toBeGreaterThan(150)
  })

  it('弹板：接触后法向反弹把滚珠弹回左上方', () => {
    const level = mini({ spawnX: 40, spawnY: 34, spawnVX: 40 })
    const pieces = [S(1, 1, 1), S(2, 2, 1), K(3, 3, 0)]
    const w = createRun(level, pieces)
    let minVx = Infinity
    while (w.outcome === 'running' && w.time < 6) {
      stepRun(w, 0.02)
      minVx = Math.min(minVx, w.vx)
    }
    // 弹板恢复系数 1.4 > 1：来向 (正, 正) 反弹为 (负, 负) 且显著加速。
    expect(minVx).toBeLessThan(-60)
  })

  it('加速带：同布局下加速带出口速度显著高于普通直板', () => {
    const base = { spawnX: 40, spawnY: 70, spawnVX: 200 }
    const plain = mini(base)
    const boosted = mini(base)
    const flats = (kind: PieceKind): Placement[] =>
      [1, 2, 3, 4].map(x => ({ x, y: 2, kind, rot: 0 }))
    const vPlain = speedAtX(plain, flats('straight'), 150)
    const vBoost = speedAtX(boosted, flats('booster'), 150)
    expect(vPlain).toBeGreaterThan(0)
    expect(vBoost).toBeGreaterThan(0)
    expect(vBoost).toBeGreaterThan(vPlain + 60)
  })

  it('尖刺：滚珠碰到尖刺命中圆即碎（失败回收）', () => {
    const level = mini({ spawnX: 48, spawnY: 100, spawnVX: 0, spikes: [{ x: 1, y: 3 }] })
    const w = simulate(level, [], 4)
    expect(w.outcome).toBe('shattered')
    // 命中点就在尖刺命中圆（中心 (54,135)、半径 10+珠半径）附近。
    expect(Math.hypot(w.px - 54, w.py - 135)).toBeLessThan(MARBLE_R + 10 + 4)
  })

  it('失败判定：飞出边界 out，撞杯壁低速停滞 stuck', () => {
    // 无轨道：高速水平射出右边界。
    const out = simulate(mini({ spawnX: 12, spawnY: 10, spawnVX: 400 }), [], 4)
    expect(out.outcome).toBe('out')
    // 平坡直通杯左壁：法向被消、摩擦耗尽切向 → 停滞（贴杯口滚过不算赢）。
    const stuck = mini({ spawnX: 40, spawnY: 100, spawnVX: 120, cupX: 5, cupY: 3 })
    const runway = [S(1, 3), S(2, 3), S(3, 3), S(4, 3)]
    const w = simulate(stuck, runway, 12)
    expect(w.outcome).toBe('stuck')
  })

  it('参考搭法五关重放全胜，且模拟确定性：同输入同轨迹、切分无关', () => {
    for (let i = 0; i < LEVELS.length; i += 1) {
      const w = simulate(LEVELS[i]!, LEVELS[i]!.reference)
      expect(w.outcome).toBe('won')
      expect(scoreFor(i, 0)).toBe((i + 1) * 100)
    }
    // 同一布局跑两次：末态逐位一致。
    const level = LEVELS[3]!
    const a = simulate(level, level.reference)
    const b = simulate(level, level.reference)
    expect(a.px).toBe(b.px)
    expect(a.py).toBe(b.py)
    expect(a.time).toBe(b.time)
    expect(a.outcome).toBe(b.outcome)
    // 步长切分不同（0.25s vs 1s）结果仍一致（固定子步保证）。
    const c = createRun(level, level.reference)
    while (c.outcome === 'running' && c.time < 15) stepRun(c, 1)
    expect(c.outcome).toBe('won')
    expect(c.px).toBe(a.px)
    expect(c.py).toBe(a.py)
  })
})
