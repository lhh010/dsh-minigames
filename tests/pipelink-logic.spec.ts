import { describe, expect, it } from 'vitest'
import {
  BASE_DIRS, FLOW_CELLS_PER_SEC, LEVEL_COUNT, LEVEL_SIZES, applyHint, applySolution,
  buildState, computeFlow, connectionsOf, createPipelinkState, generateLevel,
  levelSeed, makeCell, minRotDelta, mulberry32, restartLevel, rotateCell,
  solvePiece, tickFlow, validateNow, winScore, advanceLevel,
  type LevelGrid, type PipeKind,
} from '../src/client/games/pipelink/logic.ts'

/** 同一 seed 两次生成的盘面必须完全一致（可序列化对比用 JSON）。 */
function snapshot(def: LevelGrid): string {
  return JSON.stringify(def.grid.map((row) => row.map((c) => [c.kind, c.rot, c.poison, c.fixed, c.solutionRot])))
}

describe('pipelink logic', () => {
  it('mulberry32 是确定性的，levelSeed 区分关卡', () => {
    const a = mulberry32(1234)
    const b = mulberry32(1234)
    for (let i = 0; i < 8; i += 1) expect(a()).toBe(b())
    const c = mulberry32(1235)
    expect(a()).not.toBe(c())
    expect(levelSeed(42, 1)).not.toBe(levelSeed(42, 2))
    expect(levelSeed(42, 1)).toBe(levelSeed(42, 1))
  })

  it('connectionsOf 按顺时针旋转换算各管型开口', () => {
    expect(connectionsOf(makeCell('straight', 0))).toEqual([1, 3])
    expect(connectionsOf(makeCell('straight', 1))).toEqual([0, 2])
    expect(connectionsOf(makeCell('elbow', 0))).toEqual([0, 1])
    expect(connectionsOf(makeCell('elbow', 1))).toEqual([1, 2])
    expect(connectionsOf(makeCell('elbow', 3))).toEqual([0, 3])
    expect(connectionsOf(makeCell('tee', 0))).toEqual([0, 1, 3])
    expect(connectionsOf(makeCell('cross', 2))).toEqual([0, 1, 2, 3])
    expect(connectionsOf(makeCell('cap', 2))).toEqual([2])
    expect(connectionsOf(makeCell('source', 1))).toEqual([2, 3])
    expect(connectionsOf(makeCell('drain', 0))).toEqual([0, 3])
  })

  it('minRotDelta：直管双向等价、四通与固定件为 0', () => {
    expect(minRotDelta(makeCell('straight', 3, { solutionRot: 1 }))).toBe(0)
    expect(minRotDelta(makeCell('elbow', 2, { solutionRot: 1 }))).toBe(3)
    expect(minRotDelta(makeCell('cap', 1, { solutionRot: 3 }))).toBe(2)
    expect(minRotDelta(makeCell('cross', 3, { solutionRot: 0 }))).toBe(0)
    expect(minRotDelta(makeCell('elbow', 0, { fixed: true, solutionRot: 2 }))).toBe(0)
  })

  it('solvePiece 是 connectionsOf 的反函数，非法开口返回 null', () => {
    const kinds: PipeKind[] = ['straight', 'elbow', 'tee', 'cross', 'cap']
    for (const kind of kinds) {
      for (let rot = 0; rot < 4; rot += 1) {
        const solved = solvePiece(connectionsOf(makeCell(kind, rot)))
        expect(solved).not.toBeNull()
        // 同一开口集合至少解出一个等价管型（方向集合一致）。
        const got = solved!
        expect(connectionsOf(makeCell(got.kind, got.rot))).toEqual(connectionsOf(makeCell(kind, rot)))
      }
    }
    expect(solvePiece([0, 2, 2])).toBeNull()
  })

  it('生成关卡：尺寸/源头/出口/步数上限，初始未通、解方向必通（多 seed）', () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      for (let level = 1; level <= LEVEL_COUNT; level += 1) {
        const state = createPipelinkState(seed, level)
        expect(state.size).toBe(LEVEL_SIZES[level - 1])
        expect(state.status).toBe('playing')
        expect(state.moves).toBe(0)
        expect(state.moveLimit).toBeGreaterThan(0)
        expect(state.sources[0]).toEqual({ r: 0, c: 0 })
        expect(state.drain).toEqual({ r: state.size - 1, c: state.size - 1 })
        // 初始盘面不得已连通。
        expect(computeFlow(state).allConnected).toBe(false)
        // 解方向必须让全部源头汇到出口（生成可解性）。
        applySolution(state)
        expect(computeFlow(state).allConnected).toBe(true)
      }
    }
  })

  it('后期关卡：双源头（4/5 关）与毒水管（3 关起）不破坏可解性', () => {
    for (let seed = 1; seed <= 12; seed += 1) {
      const late = createPipelinkState(seed, 4)
      expect(late.sources.length).toBe(2)
      expect(late.sources[1]).toEqual({ r: 0, c: late.size - 1 })
      const withPoison = createPipelinkState(seed, 3)
      let poisonCount = 0
      for (const row of withPoison.grid) for (const cell of row) if (cell.poison) poisonCount += 1
      expect(poisonCount).toBeGreaterThanOrEqual(2)
      applySolution(withPoison)
      applySolution(late)
      expect(computeFlow(withPoison).allConnected).toBe(true)
      expect(computeFlow(late).allConnected).toBe(true)
      expect(computeFlow(late).perSource).toEqual([true, true])
    }
  })

  it('毒水管阻流：连通路径上的毒管让 BFS 断流', () => {
    // 手工 3×3 通路：(0,0)→(0,1)→(1,1)→(1,2)→(2,2)，中途 (1,1) 下毒后断流。
    const g: LevelGrid = {
      size: 3,
      grid: [
        [makeCell('source', 0, { role: 'source', fixed: true }), makeCell('elbow', 2), makeCell('cap', 0)],
        [makeCell('cap', 2), makeCell('elbow', 0), makeCell('elbow', 2)],
        [makeCell('cap', 0), makeCell('cap', 0), makeCell('drain', 0, { role: 'drain', fixed: true })],
      ],
      sources: [{ r: 0, c: 0 }],
      drain: { r: 2, c: 2 },
      moveLimit: 9,
    }
    const state = buildState(g, 1, 1)
    const full = computeFlow(state)
    expect(full.allConnected).toBe(true)
    expect(full.order.length).toBe(5)
    g.grid[1]![1]!.poison = true
    const blocked = computeFlow(state)
    expect(blocked.allConnected).toBe(false)
    expect(blocked.order).not.toContainEqual({ r: 1, c: 1 })
    expect(blocked.order).not.toContainEqual({ r: 1, c: 2 })
  })

  it('rotateCell：拒绝固定件/越界/非 playing，计步并在连通时转入 flowing', () => {
    const state = createPipelinkState(7, 1)
    expect(rotateCell(state, -1, 0)).toBe(false)
    expect(rotateCell(state, 0, 0)).toBe(false) // 源头固定
    expect(rotateCell(state, state.size - 1, state.size - 1)).toBe(false) // 出口固定
    const cell = state.grid[1]![0]!
    if (!cell.fixed) {
      const before = cell.rot
      expect(rotateCell(state, 1, 0)).toBe(true)
      expect(cell.rot).toBe((before + 1) % 4)
      expect(state.moves).toBe(1)
    }
    applySolution(state)
    expect(validateNow(state)).toBe(true)
    expect(state.status).toBe('flowing')
    expect(rotateCell(state, 1, 1)).toBe(false) // flowing 拒绝输入
  })

  it('步数耗尽未连通判负', () => {
    const state = createPipelinkState(7, 1)
    state.moves = state.moveLimit
    expect(validateNow(state)).toBe(false)
    expect(state.status).toBe('lost')
    expect(state.flow).toBeNull()
  })

  it('applyHint 逐步纠偏：反复提示后必可通过 validateNow', () => {
    const state = createPipelinkState(11, 2)
    let guard = 0
    while (state.status === 'playing' && guard < 200) {
      const p = applyHint(state)
      guard += 1
      if (p === null) break
    }
    expect(state.moves).toBeGreaterThan(0)
    // 每次提示恰好 +1 步且朝解收敛：循环结束时必然已连通进入放水。
    expect(state.status).toBe('flowing')
    expect(validateNow(state)).toBe(false) // flowing 后重复验证被拒绝
  })

  it('tickFlow 推进动画并在灌满时按 winScore 结算', () => {
    const state = createPipelinkState(3, 1)
    applySolution(state)
    validateNow(state)
    const total = state.flow!.order.length
    const movesBefore = state.moves
    const scoreBefore = state.score
    expect(tickFlow(state, 1 / FLOW_CELLS_PER_SEC)).toBe(false)
    expect(state.flow!.progress).toBeCloseTo(1, 5)
    expect(state.status).toBe('flowing')
    expect(tickFlow(state, total / FLOW_CELLS_PER_SEC)).toBe(true)
    expect(state.status).toBe('won')
    expect(state.score).toBe(scoreBefore + winScore({ ...state, moves: movesBefore } as typeof state))
    expect(tickFlow(state, 1)).toBe(false) // won 后不再结算
  })

  it('advanceLevel 循环 5 关且保留分数；restartLevel 同 seed 复盘同盘面', () => {
    const state = createPipelinkState(99, 1)
    const first = snapshot(generateLevel(1, mulberry32(levelSeed(99, 1))))
    applySolution(state)
    validateNow(state)
    tickFlow(state, state.flow!.order.length / FLOW_CELLS_PER_SEC)
    const score = state.score
    advanceLevel(state)
    expect(state.level).toBe(2)
    expect(state.size).toBe(LEVEL_SIZES[1])
    expect(state.score).toBe(score)
    expect(state.status).toBe('playing')
    state.level = LEVEL_COUNT
    restartLevel(state)
    expect(state.level).toBe(LEVEL_COUNT)
    expect(state.moves).toBe(0)
    expect(state.status).toBe('playing')
    expect(snapshot(generateLevel(1, mulberry32(levelSeed(99, 1))))).toBe(first)
  })
})
