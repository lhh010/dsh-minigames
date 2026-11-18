/**
 * 七巧拼图 Tangram2 逻辑测试：形状面积与全等、旋转 / 翻转变换、放置判定
 * （容差吸附）、覆盖与过关判定、12 个图形数据的合法性（面积守恒 + 互不
 * 重叠 + 与基准块全等）、计分单调性、seed 确定性与提示放置。
 */
import { describe, expect, it } from 'vitest'
import {
  FIGURES, LEVEL_FIGURES, SNAP_TOL, computeScore, coveragePercent, createLevel,
  cycleRotation, hintPlace, isLevelClear, mulberry32, placedCount, polygonArea,
  polygonCenter, polygonOf, polysCongruentPos, toggleFlip, tryPlace,
  type Pt, type TangramState,
} from '../src/client/games/tangram2/logic.ts'

/** 各形状在 unit=1（8x8 网格）下的基准面积。 */
const KIND_AREA: Record<string, number> = { large: 16, medium: 8, small: 4, square: 8, para: 8 }

/** 把某块板按标准解摆好（搜索 16 种姿态），返回是否找到吻合槽位。 */
function solvePieceAt(state: TangramState, id: number): boolean {
  const piece = state.pieces.find((q) => q.id === id)!
  for (const slot of state.slots) {
    if (slot.taken || slot.kind !== piece.kind) continue
    const [cx, cy] = slot.center
    for (let flip = 0; flip < 2; flip += 1) {
      for (let rot = 0; rot < 8; rot += 1) {
        const cand = polygonOf(piece.kind, rot, flip === 1, cx, cy, state.unit)
        if (polysCongruentPos(cand, slot.poly, 1e-6)) {
          piece.rot = rot
          piece.flipped = flip === 1
          piece.x = cx
          piece.y = cy
          return true
        }
      }
    }
  }
  return false
}

/** 点到线段距离（重叠采样时剔除边界点）。 */
function distSeg(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1
  const dy = y2 - y1
  const len = dx * dx + dy * dy
  let t = len > 0 ? ((px - x1) * dx + (py - y1) * dy) / len : 0
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

/** 严格内部点采样判定（避开公共边，检验真实重叠）。 */
function insideStrict(x: number, y: number, poly: readonly Pt[]): boolean {
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    if (distSeg(x, y, poly[j]![0], poly[j]![1], poly[i]![0], poly[i]![1]) < 1e-6) return false
  }
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const pi = poly[i]!
    const pj = poly[j]!
    if ((pi[1] > y) !== (pj[1] > y) && x <= pi[0] + ((y - pi[1]) / (pj[1] - pi[1])) * (pj[0] - pi[0])) inside = !inside
  }
  return inside
}

describe('tangram2 logic', () => {
  it('mulberry32 is deterministic per seed, stays in [0,1), and diverges across seeds', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    const seqA = Array.from({ length: 8 }, () => a())
    const seqB = Array.from({ length: 8 }, () => b())
    expect(seqA).toEqual(seqB)
    for (const v of seqA) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
    const c = mulberry32(4242)
    const seqC = Array.from({ length: 8 }, () => c())
    expect(seqA).not.toEqual(seqC)
  })

  it('base piece areas match the standard tangram ratios and figure data is well-formed', () => {
    for (const [kind, area] of Object.entries(KIND_AREA)) {
      expect(polygonArea(polygonOf(kind as 'large', 0, false, 100, 100, 1))).toBeCloseTo(area, 9)
    }
    expect(FIGURES).toHaveLength(12)
    expect(FIGURES.map((f) => f.name).join(',')).toContain('方块')
    expect(LEVEL_FIGURES).toHaveLength(5)
    for (const idx of LEVEL_FIGURES) {
      expect(idx).toBeLessThan(FIGURES.length)
    }
  })

  it('transforms: 8 rotations and double flip are identities; rotation preserves area and centroid', () => {
    const base = polygonOf('para', 0, false, 200, 200, 3)
    const cycled = polygonOf('para', 8, false, 200, 200, 3)
    expect(polysCongruentPos(base, cycled, 1e-9)).toBe(true)
    expect(polysCongruentPos(polygonOf('large', 3, true, 60, 90, 2.5), polygonOf('large', 3, true, 60, 90, 2.5), 1e-9)).toBe(true)
    for (let rot = 0; rot < 8; rot += 1) {
      const poly = polygonOf('small', rot, true, 120, 80, 4)
      expect(polygonArea(poly)).toBeCloseTo(4 * 16, 6)
      const [cx, cy] = polygonCenter(poly)
      expect(cx).toBeCloseTo(120, 9)
      expect(cy).toBeCloseTo(80, 9)
    }
  })

  it('polysCongruentPos: identity matches, big offsets and mirrored para do not', () => {
    const slot = polygonOf('para', 2, false, 300, 300, 2)
    expect(polysCongruentPos(polygonOf('para', 2, false, 300, 300, 2), slot, SNAP_TOL)).toBe(true)
    expect(polysCongruentPos(polygonOf('para', 2, false, 330, 300, 2), slot, SNAP_TOL)).toBe(false)
    // 平行四边形是手性形状：未翻转姿态只在 rot 与自对称的 rot+4 命中，镜像姿态全部落空。
    let unflippedMatch = 0
    let flippedMatch = 0
    for (let rot = 0; rot < 8; rot += 1) {
      if (polysCongruentPos(polygonOf('para', rot, false, 300, 300, 2), slot, 1e-6)) unflippedMatch += 1
      if (polysCongruentPos(polygonOf('para', rot, true, 300, 300, 2), slot, 1e-6)) flippedMatch += 1
    }
    expect(unflippedMatch).toBe(2)
    expect(flippedMatch).toBe(0)
    // 镜像槽位反过来只被翻转姿态命中——F 键真正改变可解性。
    const mirroredSlot = polygonOf('para', 2, true, 300, 300, 2)
    let hitUnflipped = 0
    let hitFlipped = 0
    for (let rot = 0; rot < 8; rot += 1) {
      if (polysCongruentPos(polygonOf('para', rot, false, 300, 300, 2), mirroredSlot, 1e-6)) hitUnflipped += 1
      if (polysCongruentPos(polygonOf('para', rot, true, 300, 300, 2), mirroredSlot, 1e-6)) hitFlipped += 1
    }
    expect(hitUnflipped).toBe(0)
    expect(hitFlipped).toBe(2)
  })

  it('all 12 figures: pieces are congruent to their kind, total area is 64, and nothing overlaps', () => {
    for (const figure of FIGURES) {
      let total = 0
      for (const slot of figure.pieces) {
        total += polygonArea(slot.poly)
        expect(polygonArea(slot.poly)).toBeCloseTo(KIND_AREA[slot.kind]!, 3)
        const [cx, cy] = polygonCenter(slot.poly)
        let matches = false
        for (let flip = 0; flip < 2 && !matches; flip += 1) {
          for (let rot = 0; rot < 8 && !matches; rot += 1) {
            if (polysCongruentPos(polygonOf(slot.kind, rot, flip === 1, cx, cy, 1), slot.poly, 1e-4)) matches = true
          }
        }
        expect(matches).toBe(true)
      }
      expect(total).toBeCloseTo(64, 3)
      // 严格内部采样：任何样本点至多落在一块板内。
      const polys = figure.pieces.map((s) => s.poly)
      const xs = polys.flat()
      const minx = Math.min(...xs.map((p) => p[0]))
      const maxx = Math.max(...xs.map((p) => p[0]))
      const miny = Math.min(...xs.map((p) => p[1]))
      const maxy = Math.max(...xs.map((p) => p[1]))
      let overlaps = 0
      const n = 60
      for (let i = 0; i <= n; i += 1) {
        for (let j = 0; j <= n; j += 1) {
          const x = minx + ((maxx - minx) * i) / n
          const y = miny + ((maxy - miny) * j) / n
          let count = 0
          for (const poly of polys) if (insideStrict(x, y, poly)) count += 1
          if (count > 1) overlaps += 1
        }
      }
      expect(overlaps).toBe(0)
    }
  })

  it('createLevel is deterministic per seed and scatters differently across seeds', () => {
    const a = createLevel(1, 777)
    const b = createLevel(1, 777)
    expect(a.pieces).toEqual(b.pieces)
    expect(a.slots).toEqual(b.slots)
    expect(a.name).toBe(b.name)
    const c = createLevel(1, 778)
    expect(JSON.stringify(a.pieces.map((p) => [p.x, p.y, p.rot]))).not.toBe(JSON.stringify(c.pieces.map((p) => [p.x, p.y, p.rot])))
    for (const p of a.pieces) {
      expect(p.placed).toBe(false)
      expect(p.rot).toBeGreaterThanOrEqual(0)
      expect(p.rot).toBeLessThan(8)
    }
    expect(coveragePercent(a)).toBe(0)
  })

  it('tryPlace snaps a correctly-posed piece to its slot and rejects repeats', () => {
    const state = createLevel(2, 99)
    const piece = state.pieces.find((p) => p.kind === 'large')!
    expect(solvePieceAt(state, piece.id)).toBe(true)
    expect(tryPlace(state, piece.id)).toBe(true)
    expect(piece.placed).toBe(true)
    const slot = state.slots.find((s) => s.taken)!
    expect(polygonCenter(slot.poly)[0]).toBeCloseTo(piece.x, 9)
    // 已放置的块不能再次放置。
    expect(tryPlace(state, piece.id)).toBe(false)
  })

  it('tryPlace tolerates small offsets, rejects wrong rotation and far positions', () => {
    const state = createLevel(1, 5)
    const piece = state.pieces.find((p) => p.kind === 'large')!
    expect(solvePieceAt(state, piece.id)).toBe(true)
    piece.x += 8
    piece.y += 6
    expect(tryPlace(state, piece.id)).toBe(true)
    const other = state.pieces.find((p) => p.kind === 'large' && !p.placed)!
    expect(solvePieceAt(state, other.id)).toBe(true)
    other.x += 40
    expect(tryPlace(state, other.id)).toBe(false)
    other.x -= 40
    other.rot = (other.rot + 1) % 8
    expect(tryPlace(state, other.id)).toBe(false)
  })

  it('coverage grows with placements; 7/7 placed reaches 100% and clears, 6/7 does not', () => {
    const state = createLevel(3, 1234)
    expect(coveragePercent(state)).toBe(0)
    for (const piece of state.pieces) {
      expect(solvePieceAt(state, piece.id)).toBe(true)
      expect(tryPlace(state, piece.id)).toBe(true)
    }
    expect(placedCount(state)).toBe(7)
    expect(coveragePercent(state)).toBeCloseTo(100, 6)
    expect(isLevelClear(state)).toBe(true)
    const partial = createLevel(3, 1234)
    for (const piece of partial.pieces.slice(0, 6)) {
      expect(solvePieceAt(partial, piece.id)).toBe(true)
      expect(tryPlace(partial, piece.id)).toBe(true)
    }
    expect(placedCount(partial)).toBe(6)
    expect(isLevelClear(partial)).toBe(false)
  })

  it('computeScore decreases with time and moves, and is floored at 120', () => {
    const fast = computeScore(1, 5000, 2)
    const slow = computeScore(1, 60000, 12)
    expect(fast).toBeGreaterThan(slow)
    expect(computeScore(5, 0, 0)).toBeGreaterThan(computeScore(1, 0, 0))
    expect(computeScore(1, 1000 * 60 * 60, 10000)).toBe(120)
  })

  it('hintPlace solves the whole figure piece by piece; rotate/flip helpers stay invertible', () => {
    const state = createLevel(5, 2024)
    const ids: number[] = []
    for (let i = 0; i < 7; i += 1) {
      const id = hintPlace(state)
      expect(id).not.toBeNull()
      ids.push(id as number)
    }
    expect(new Set(ids).size).toBe(7)
    expect(hintPlace(state)).toBeNull()
    expect(isLevelClear(state)).toBe(true)
    expect(coveragePercent(state)).toBeCloseTo(100, 6)
    const fresh = createLevel(1, 8)
    const piece = fresh.pieces[0]!
    const rot0 = piece.rot
    const flip0 = piece.flipped
    for (let i = 0; i < 8; i += 1) cycleRotation(fresh, piece.id)
    toggleFlip(fresh, piece.id)
    toggleFlip(fresh, piece.id)
    expect(piece.rot).toBe(rot0)
    expect(piece.flipped).toBe(flip0)
    expect(fresh.moves).toBe(0)
  })
})
