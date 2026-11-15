import { describe, expect, it } from 'vitest'
import {
  buildPatternScene, computeScore, createLevel, cyclePiece, hash2, hintPlace,
  isComplete, LEVELS, placedCount, sampleScene, SNAP_TOL, targetCenter, tryPlace,
  type JigsawState, type PatternScene,
} from '../src/client/games/jigsaw/logic.ts'

/** 手工构造的极简场景：中心一个不透明圆 + 底部两个噪点。 */
function manualScene(): PatternScene {
  return {
    baseTop: '#ffffff',
    baseBottom: '#000000',
    shapes: [{ kind: 'circle', fx: 0.5, fy: 0.5, r: 0.2, color: '#ff0000', alpha: 1 }],
    speckles: [
      { fx: 0.1, fy: 0.9, r: 0.01, color: '#00ff00' },
      { fx: 0.9, fy: 0.9, r: 0.01, color: '#0000ff' },
    ],
  }
}

/** 把某块碎片摆到目标格中心附近。 */
function centerAt(state: JigsawState, id: number, dx = 0, dy = 0): void {
  const p = state.pieces.find((q) => q.id === id)!
  const t = targetCenter(state.size, p.row, p.col)
  p.x = t.x + dx
  p.y = t.y + dy
}

describe('jigsaw logic', () => {
  it('buildPatternScene is fully deterministic per seed and diverges across seeds', () => {
    const a = buildPatternScene(1234)
    const b = buildPatternScene(1234)
    expect(a).toEqual(b)
    expect(a.shapes).toHaveLength(9)
    expect(a.speckles).toHaveLength(46)
    for (const s of a.shapes) {
      expect(['circle', 'square', 'triangle']).toContain(s.kind)
      expect(s.r).toBeGreaterThanOrEqual(0.06)
      expect(s.r).toBeLessThanOrEqual(0.22)
      expect(s.alpha).toBeGreaterThanOrEqual(0.5)
      expect(s.alpha).toBeLessThanOrEqual(0.9)
    }
    const c = buildPatternScene(4321)
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c))
  })

  it('sampleScene picks the topmost element: shape over gradient over speckle', () => {
    const scene = manualScene()
    expect(sampleScene(scene, 0.5, 0.5)).toBe('#ff0000')
    expect(sampleScene(scene, 0.1, 0.9)).toBe('#00ff00')
    // 圆内没有噪点覆盖；圆外纯渐变：顶部应为纯白、底部应为纯黑，中点是灰。
    expect(sampleScene(scene, 0.5, 0)).toBe('#ffffff')
    expect(sampleScene(scene, 0.15, 0.5)).toBe('#808080')
    expect(sampleScene(scene, 0.5, 1)).toBe('#000000')
    // 未知坐标的确定性哈希稳定且落在 [0,1)。
    expect(hash2(2, 3, 99)).toBe(hash2(2, 3, 99))
    expect(hash2(2, 3, 99)).toBeGreaterThanOrEqual(0)
    expect(hash2(2, 3, 99)).toBeLessThan(1)
  })

  it('createLevel scatters exactly size^2 unique pieces inside the tray', () => {
    const state = createLevel(1, 42)
    const cfg = LEVELS[0]!
    expect(state.size).toBe(cfg.size)
    expect(state.pieces).toHaveLength(cfg.size * cfg.size)
    expect(new Set(state.pieces.map((p) => p.id)).size).toBe(cfg.size * cfg.size)
    expect(state.pieces.map((p) => p.id)).toEqual([...state.pieces.map((p) => p.id)].sort((a, b) => a - b))
    for (const p of state.pieces) {
      expect(p.x).toBeGreaterThanOrEqual(14)
      expect(p.x).toBeLessThanOrEqual(14 + 6 * 64 + 28) // 托盘右界外留量
      expect(p.y).toBeGreaterThan(0)
      // 无旋转关全部 0 档。
      expect(p.rot).toBe(0)
      expect(p.placed).toBe(false)
    }
    // 第 3 关起需要旋转：至少存在一块初始非 0 档（4 档 × 25 块，概率上必然）。
    const rotated = createLevel(3, 42)
    expect(rotated.rotate).toBe(true)
    expect(rotated.pieces.some((p) => p.rot !== 0)).toBe(true)
  })

  it('tryPlace snaps within SNAP_TOL of the target center and rejects beyond it', () => {
    const state = createLevel(1, 7)
    const id = state.pieces[0]!.id
    centerAt(state, id, 0, 0)
    expect(tryPlace(state, id)).toBe(true)
    const placed = state.pieces[0]!
    const t = targetCenter(state.size, placed.row, placed.col)
    expect(placed.placed).toBe(true)
    expect(placed.x).toBe(t.x)
    expect(placed.y).toBe(t.y)
    // 超出容差：不吸附不动。
    const state2 = createLevel(1, 7)
    const id2 = state2.pieces[1]!.id
    centerAt(state2, id2, SNAP_TOL + 1, 0)
    expect(tryPlace(state2, id2)).toBe(false)
    expect(state2.pieces[1]!.placed).toBe(false)
    // 自定义容差同样生效。
    centerAt(state2, id2, 10, 0)
    expect(tryPlace(state2, id2, 5)).toBe(false)
    expect(tryPlace(state2, id2, 12)).toBe(true)
  })

  it('rotate levels require rot back to 0 before snapping; plain levels ignore rot', () => {
    const state = createLevel(3, 9)
    const p = state.pieces[5]!
    p.rot = 2
    centerAt(state, p.id, 0, 0)
    expect(tryPlace(state, p.id)).toBe(false)
    cyclePiece(state, p.id)
    cyclePiece(state, p.id)
    expect(p.rot).toBe(0)
    expect(tryPlace(state, p.id)).toBe(true)
    // 非旋转关：任意档位都允许吸附。
    const plain = createLevel(1, 9)
    const q = plain.pieces[3]!
    q.rot = 3
    centerAt(plain, q.id)
    expect(plain.rotate).toBe(false)
    expect(tryPlace(plain, q.id)).toBe(true)
  })

  it('cyclePiece loops 0→3→0 and ignores unknown ids; placed pieces stay fixed', () => {
    const state = createLevel(1, 5)
    const p = state.pieces[0]!
    expect(p.rot).toBe(0)
    cyclePiece(state, p.id)
    expect(p.rot).toBe(1)
    cyclePiece(state, p.id)
    cyclePiece(state, p.id)
    expect(p.rot).toBe(3)
    cyclePiece(state, p.id)
    expect(p.rot).toBe(0)
    expect(() => cyclePiece(state, 9999)).not.toThrow()
    // 已吸附的碎片再尝试放置直接失败。
    centerAt(state, p.id)
    expect(tryPlace(state, p.id)).toBe(true)
    expect(tryPlace(state, p.id)).toBe(false)
  })

  it('hintPlace fills the lowest unplaced piece and nulls out when complete', () => {
    const state = createLevel(1, 11)
    let guard = 0
    while (!isComplete(state)) {
      const id = hintPlace(state)
      expect(id).not.toBeNull()
      const p = state.pieces.find((q) => q.id === id)!
      expect(p.placed).toBe(true)
      expect(p.rot).toBe(0)
      guard += 1
      if (guard > 100) throw new Error('hint loop did not terminate')
    }
    expect(placedCount(state)).toBe(state.size * state.size)
    expect(hintPlace(state)).toBeNull()
  })

  it('computeScore rewards level and speed, punishes moves, floors at 100', () => {
    expect(computeScore(1, 0, 0)).toBe(700)
    expect(computeScore(5, 0, 0)).toBe(2300)
    expect(computeScore(3, 10000, 0)).toBe(1480)
    expect(computeScore(3, 0, 10)).toBe(1450)
    expect(computeScore(1, 1000 * 1000, 1000)).toBe(100)
  })

  it('same (level, seed) replays identically; other seeds or levels diverge', () => {
    const trace = (level: number, seed: number): string => {
      const s = createLevel(level, seed)
      const marks: number[] = []
      for (const p of s.pieces) {
        marks.push(p.id, p.row, p.col, Math.round(p.x * 1000), Math.round(p.y * 1000), p.rot)
      }
      marks.push(s.moves)
      return JSON.stringify(marks)
    }
    expect(trace(2, 888)).toBe(trace(2, 888))
    expect(trace(2, 888)).not.toBe(trace(2, 777))
    expect(trace(2, 888)).not.toBe(trace(4, 888))
    // 图案同样确定：同 seed 同场景采样一致。
    const sa = buildPatternScene(888)
    const sb = buildPatternScene(888)
    for (let i = 0; i < 20; i += 1) {
      expect(sampleScene(sa, i / 20, 0.37)).toBe(sampleScene(sb, i / 20, 0.37))
    }
  })
})
