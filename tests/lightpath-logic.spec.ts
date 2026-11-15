import { describe, expect, it } from 'vitest'
import {
  MAX_BEAM_STEPS, SIZE, applyFlip, cloneState, computeScore, evaluate, generateLevel,
  hintFlip, levelSpec, mulberry32, reflect, splitOutputs,
  type Cell, type Dir, type LightPathState, type Mirror, type MirrorKind,
} from '../src/client/games/lightpath/logic.ts'

/** 空墙盘上的手工局面构造器。 */
function makeState(overrides: {
  source?: { row: number, col: number, dir: Dir }
  mirrors?: Array<[number, number, MirrorKind]>
  splitters?: Array<[number, number]>
  crystals?: Array<[number, number]>
  walls?: Array<[number, number]>
  level?: number
  moves?: number
}): LightPathState {
  const walls: boolean[][] = []
  for (let r = 0; r < SIZE; r += 1) walls.push(new Array<boolean>(SIZE).fill(false))
  for (const [r, c] of overrides.walls ?? []) walls[r]![c] = true
  const mirrors: Mirror[] = (overrides.mirrors ?? []).map(([row, col, kind]) => ({ row, col, kind }))
  const splitters: Cell[] = (overrides.splitters ?? []).map(([row, col]) => ({ row, col }))
  const crystals: Cell[] = (overrides.crystals ?? []).map(([row, col]) => ({ row, col }))
  const level = overrides.level ?? 1
  return {
    seed: 1,
    level,
    walls,
    source: overrides.source ?? { row: 4, col: 0, dir: 'right' },
    mirrors,
    splitters,
    crystals,
    moves: overrides.moves ?? 0,
    score: computeScore(level, overrides.moves ?? 0),
    won: false,
  }
}

const litOf = (s: LightPathState): number[] => [...evaluate(s).lit].sort((a, b) => a - b)
const key = (row: number, col: number): number => row * SIZE + col

/** 枚举全部镜面朝向组合，返回是否存在全点亮组合。 */
function solvableByEnumeration(s: LightPathState): boolean {
  const n = s.mirrors.length
  for (let mask = 0; mask < 2 ** n; mask += 1) {
    const probe = cloneState(s)
    for (let i = 0; i < n; i += 1) {
      probe.mirrors[i]!.kind = ((mask >> i) & 1) === 1 ? '/' : '\\'
    }
    const result = evaluate(probe)
    if (result.litCrystals === probe.crystals.length) return true
  }
  return false
}

describe('lightpath logic', () => {
  it('reflect maps all four directions through both mirror kinds (90° turns)', () => {
    // '/'：右→上、左→下、上→右、下→左；'\\'：右→下、左→上。
    expect(reflect('/', 0, 1)).toEqual([-1, 0])
    expect(reflect('/', 0, -1)).toEqual([1, 0])
    expect(reflect('/', -1, 0)).toEqual([0, 1])
    expect(reflect('/', 1, 0)).toEqual([0, -1])
    expect(reflect('\\', 0, 1)).toEqual([1, 0])
    expect(reflect('\\', 0, -1)).toEqual([-1, 0])
    // 变换是反射律的（两次过同向镜不还原，但过两面平行同向镜还原）。
    const once = reflect('/', 0, 1)
    // 同镜二次反射=对合（时间可逆）：出射回到入射方向。
    const twice = reflect('/', once[0], once[1])
    expect(twice).toEqual([0, 1])
  })

  it('splitter emits one straight-through beam and one /-reflected beam', () => {
    expect(splitOutputs(0, 1)).toEqual([[0, 1], [-1, 0]])
    // 盘上：源 (4,0) 向右，分光镜 (4,3) → 直通照亮 (4,5..)，反射照亮 (3,3)..(0,3)。
    const s = makeState({ splitters: [[4, 3]], crystals: [[4, 6], [1, 3]] })
    const lit = litOf(s)
    expect(lit).toContain(key(4, 6))
    expect(lit).toContain(key(1, 3))
    expect(evaluate(s).litCrystals).toBe(2)
  })

  it('beams terminate at walls and board edges; crystals behind a wall stay dark', () => {
    const s = makeState({ walls: [[4, 4]], crystals: [[4, 6]] })
    const result = evaluate(s)
    expect(result.lit).toContain(key(4, 3))
    expect(result.lit).not.toContain(key(4, 4))
    expect(result.lit).not.toContain(key(4, 6))
    expect(result.litCrystals).toBe(0)
    // 出界终止：向上直射到顶边为止，segment 止于 (0,0)。
    const edge = makeState({ source: { row: 4, col: 0, dir: 'up' } })
    const segs = evaluate(edge).segments
    expect(segs.length).toBe(1)
    expect(segs[0]).toEqual({ r0: 4, c0: 0, r1: 0, c1: 0 })
  })

  it('crystal cells are lit and passed through without bending the beam', () => {
    const s = makeState({ crystals: [[4, 2]] })
    const lit = litOf(s)
    expect(lit).toContain(key(4, 2))
    expect(lit).toContain(key(4, 8))
    expect(lit).toContain(key(4, 1))
  })

  it('applyFlip toggles a mirror, re-evaluates win, counts moves, and freezes after win', () => {
    // 源 (4,0) 向右；镜 '\\' 在 (4,4) 把光折向下 → 水晶 (8,4) 亮。
    const base = makeState({ mirrors: [[4, 4, '\\']], crystals: [[8, 4]] })
    expect(evaluate(base).litCrystals).toBe(1)
    expect(base.won).toBe(false)
    // 翻成 '/'：光折向上，水晶熄灭。
    const flipped = applyFlip(base, 4, 4)
    expect(flipped).not.toBeNull()
    expect(flipped!.mirrors[0]!.kind).toBe('/')
    expect(evaluate(flipped!).litCrystals).toBe(0)
    expect(flipped!.moves).toBe(1)
    expect(flipped!.score).toBe(computeScore(1, 1))
    // 再翻回 '\\'：全点亮 → won。
    const solved = applyFlip(flipped!, 4, 4)
    expect(solved).not.toBeNull()
    expect(solved!.won).toBe(true)
    expect(solved!.moves).toBe(2)
    // 已过关状态不再接受翻转；空格翻转返回 null。
    expect(applyFlip(solved!, 4, 4)).toBeNull()
    expect(applyFlip(flipped!, 0, 0)).toBeNull()
    // 原状态不可变（纯函数）。
    expect(base.mirrors[0]!.kind).toBe('\\')
    expect(base.moves).toBe(0)
  })

  it('hintFlip greedily flips a mirror that strictly improves lit crystals', () => {
    // '\\' (4,4) 点亮 (8,4)；'/' (4,2) 当前向上折射照亮 (0,2) 区域——
    // 直接手工构造「未点亮但存在一面改善」的局面。
    const s = makeState({
      mirrors: [[4, 4, '/'], [4, 7, '\\']],
      crystals: [[8, 4]],
    })
    expect(evaluate(s).litCrystals).toBe(0)
    const hinted = hintFlip(s)
    expect(hinted).not.toBeNull()
    expect(evaluate(hinted!).litCrystals).toBe(1)
    expect(hinted!.moves).toBe(s.moves + 1)
    // 已全亮时无提示。
    const solved = makeState({ crystals: [[4, 5]] })
    expect(evaluate(solved).litCrystals).toBe(1)
    expect(hintFlip(solved)).toBeNull()
  })

  it('generateLevel is deterministic per (seed, level) and structurally valid', () => {
    for (const [seed, level] of [[1, 1], [42, 3], [999, 5]] as const) {
      const a = generateLevel(seed, level)
      const b = generateLevel(seed, level)
      expect(a).toEqual(b)
      const spec = levelSpec(level)
      expect(a.mirrors.length).toBe(spec.mirrors)
      expect(a.crystals.length).toBe(spec.crystals)
      expect(a.splitters.length).toBe(spec.splitters)
      expect(a.moves).toBe(0)
      expect(a.won).toBe(false)
      // 实体互不重叠且不占墙格。
      const seen = new Set<number>()
      const all: Array<[number, number]> = [
        [a.source.row, a.source.col],
        ...a.mirrors.map((m) => [m.row, m.col] as [number, number]),
        ...a.splitters.map((sp) => [sp.row, sp.col] as [number, number]),
        ...a.crystals.map((c) => [c.row, c.col] as [number, number]),
      ]
      for (const [r, c] of all) {
        const k = key(r, c)
        expect(seen.has(k)).toBe(false)
        seen.add(k)
        expect(a.walls[r]![c]).toBe(false)
      }
    }
  }, 60000)

  it('all five levels: scrambled start is not won, yet a solution exists (enumerate 2^n)', () => {
    for (let level = 1; level <= 5; level += 1) {
      const s = generateLevel(2026, level)
      expect(evaluate(s).litCrystals).toBeLessThan(s.crystals.length)
      expect(solvableByEnumeration(s)).toBe(true)
      // 第 3 关起引入分光镜。
      expect(s.splitters.length).toBe(level >= 3 ? 1 : 0)
    }
  }, 60000)

  it('beam tracing is cycle-safe: a mirror loop terminates under MAX_BEAM_STEPS', () => {
    // 四面 '\\' 镜构成闭环：源射入后光束在环内循环，求值必须终止。
    const loop = makeState({
      source: { row: 1, col: 1, dir: 'right' },
      mirrors: [[1, 3, '\\'], [3, 3, '/'], [3, 1, '\\'], [1, 1, '/']],
    })
    const t0 = Date.now()
    const result = evaluate(loop)
    expect(Date.now() - t0).toBeLessThan(1000)
    expect(result.segments.length).toBeGreaterThan(0)
  })

  it('mulberry32 is deterministic and in [0,1) for repeated seeds', () => {
    const a = mulberry32(12345)
    const b = mulberry32(12345)
    const seqA = [a(), a(), a()]
    const seqB = [b(), b(), b()]
    expect(seqA).toEqual(seqB)
    for (const v of seqA) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
    expect(mulberry32(1)()).not.toBe(mulberry32(2)())
  })
});
