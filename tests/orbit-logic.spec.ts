/**
 * 引力弹弓 Orbit 逻辑测试：引力计算与多体叠加、积分子步位级重放、
 * 信标 / 撞击 / 出界 / 超时判定、倍速与分帧不影响轨迹、关卡数据与
 * 参考解合法性、seed 确定性、最佳接近距离记录。
 */
import { describe, it, expect } from 'vitest'
import {
  LEVELS, W, H, G, MIN_R, MAX_FLIGHT_SUBSTEPS,
  mulberry32, gravityAt, simulateFlight, predictPath, replayReference,
  validateLevel, createOrbit, launch, setAim, stepOrbit, retryLevel,
  advanceLevel, restartLevel, generateStarfield, currentLevel,
} from '../src/client/games/orbit/logic.ts'

const L1 = LEVELS[0]!
const L3 = LEVELS[2]!

describe('orbit logic', () => {
  it('单行星引力：方向指向行星，大小符合平方反比（含软化下限）', () => {
    // 探针位于行星正左方 200px：加速度沿 +x 指向行星。
    const g = gravityAt(L1, 120, 240)
    expect(g.ax).toBeGreaterThan(0)
    expect(Math.abs(g.ay)).toBeLessThan(1e-9)
    const expectMag = (G * 520) / (200 * 200)
    expect(Math.hypot(g.ax, g.ay)).toBeCloseTo(expectMag, 6)
    // 软化：距离小于 MIN_R 时按 MIN_R 计算，不发散。
    const near = gravityAt(L1, 319, 240)
    expect(Math.hypot(near.ax, near.ay)).toBeCloseTo((G * 520) / (MIN_R * MIN_R), 6)
  })

  it('多体引力叠加：对称两行星中点合力为零，偏移后方向正确', () => {
    const mid = { x: (L3.planets[0]!.x + L3.planets[1]!.x) / 2, y: (L3.planets[0]!.y + L3.planets[1]!.y) / 2 }
    const g = gravityAt(L3, mid.x, mid.y)
    expect(Math.abs(g.ax)).toBeLessThan(1e-9)
    expect(Math.abs(g.ay)).toBeLessThan(1e-9)
    // 中点略偏上：上方行星更强，合力指向上（ay < 0）。
    const off = gravityAt(L3, mid.x, mid.y - 20)
    expect(off.ay).toBeLessThan(0)
  })

  it('积分子步位级重放：同参数两次模拟轨迹完全一致', () => {
    const a = simulateFlight(L1, 210.1, -93.5, 600, 4)
    const b = simulateFlight(L1, 210.1, -93.5, 600, 4)
    expect(a.substeps).toBe(b.substeps)
    expect(a.minDist).toBe(b.minDist)
    expect(JSON.stringify(a.path)).toBe(JSON.stringify(b.path))
  })

  it('倍速与分帧不影响轨迹：同总模拟时长下探针位置位级一致', () => {
    const run = (speed: 1 | 2 | 4, frames: number, dtMs: number): string => {
      const s = createOrbit(1)
      s.speed = speed
      setAim(s, 180, -60)
      launch(s)
      for (let i = 0; i < frames; i += 1) stepOrbit(s, dtMs)
      expect(s.phase).toBe('flying')
      return s.probe!.x + ',' + s.probe!.y + ',' + s.probe!.vx + ',' + s.probe!.vy
    }
    // 三种切分各模拟 800ms：×1 粗帧 / ×1 细帧 / ×4 少帧。
    const a = run(1, 20, 40)
    const b = run(1, 80, 10)
    const c = run(4, 20, 10)
    expect(a).toBe(b)
    expect(a).toBe(c)
  })

  it('信标判定：探针经过信标半径内即过关（第 3 关参考解直线穿缝）', () => {
    const s = createOrbit(3)
    s.levelIndex = 2
    setAim(s, L3.refVx, L3.refVy)
    expect(launch(s)).toBe(true)
    for (let i = 0; i < 400 && s.phase === 'flying'; i += 1) stepOrbit(s, 50)
    expect(s.phase).toBe('won')
    expect(s.score).toBe(1000)
    // 过关后停留计时，advanceLevel 进入下一关。
    for (let i = 0; i < 40; i += 1) stepOrbit(s, 50)
    advanceLevel(s)
    expect(s.levelIndex).toBe(3)
    expect(s.phase).toBe('aim')
  })

  it('撞击判定：径直飞向行星则坠毁，最佳接近距离被记录且跨重试保留', () => {
    const s = createOrbit(5)
    setAim(s, 120, 0)
    launch(s)
    for (let i = 0; i < 400 && s.phase === 'flying'; i += 1) stepOrbit(s, 50)
    expect(s.phase).toBe('lost')
    expect(s.lostReason).toBe('crash')
    expect(Number.isFinite(s.bestDistance)).toBe(true)
    const kept = s.bestDistance
    retryLevel(s)
    expect(s.phase).toBe('aim')
    expect(s.bestDistance).toBe(kept)
    expect(s.launches).toBe(1)
  })

  it('出界判定：反向高速飞离边界判失败', () => {
    const sim = simulateFlight(L1, -350, 0)
    expect(sim.result).toBe('out')
  })

  it('超时判定：持续绕行不抵达信标按漂失结算', () => {
    const sim = simulateFlight(L1, 0, 88)
    expect(sim.result).toBe('timeout')
    expect(sim.substeps).toBe(MAX_FLIGHT_SUBSTEPS)
    // 状态机同样在子步预算耗尽后落到 lost/timeout。
    const s = createOrbit(9)
    s.speed = 4
    setAim(s, 0, 88)
    launch(s)
    for (let i = 0; i < 2000 && s.phase === 'flying'; i += 1) stepOrbit(s, 50)
    expect(s.phase).toBe('lost')
    expect(s.lostReason).toBe('timeout')
  })

  it('关卡数据合法：5 关几何无重叠且参考解重放确实过关', () => {
    expect(LEVELS).toHaveLength(5)
    for (const level of LEVELS) {
      expect(validateLevel(level)).toEqual([])
      const replay = replayReference(level)
      expect(replay.result).toBe('won')
      expect(replay.minDist).toBeLessThanOrEqual(level.beacon.radius)
      expect(replay.path.length).toBeGreaterThan(4)
    }
  })

  it('seed 确定性：mulberry32 与星空生成同 seed 逐位一致、异 seed 不同', () => {
    const seq = (seed: number): number[] => {
      const rng = mulberry32(seed)
      return Array.from({ length: 8 }, () => rng())
    }
    expect(seq(42)).toEqual(seq(42))
    expect(seq(42)).not.toEqual(seq(43))
    const a = generateStarfield(42)
    const b = generateStarfield(42)
    const c = generateStarfield(43)
    expect(a).toEqual(b)
    expect(a.length).toBeGreaterThan(50)
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c))
    for (const star of a) {
      expect(star.x).toBeGreaterThanOrEqual(0)
      expect(star.x).toBeLessThan(W)
      expect(star.y).toBeGreaterThanOrEqual(0)
      expect(star.y).toBeLessThan(H)
    }
  })

  it('发射守门与预测虚线：低速不发射，预测逐步截断于终局', () => {
    const s = createOrbit(2)
    setAim(s, 20, 0)
    expect(launch(s)).toBe(false)
    expect(s.phase).toBe('aim')
    // 预测：60 子步上限；径直撞行星的瞄准提前截断。
    const pts = predictPath(L1, 180, -60, 60)
    expect(pts.length).toBeGreaterThan(0)
    expect(pts.length).toBeLessThanOrEqual(60)
    const doomed = predictPath(L1, 120, 0, 600)
    expect(doomed.length).toBeLessThan(600)
    // restartLevel 清零发射数并回到瞄准。
    setAim(s, 200, 0)
    launch(s)
    restartLevel(s)
    expect(s.phase).toBe('aim')
    expect(s.launches).toBe(0)
    expect(currentLevel(s)).toBe(LEVELS[0])
  })
})
