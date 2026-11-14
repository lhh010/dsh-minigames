import { describe, expect, it } from 'vitest'
import {
  CANDIDATE_TEETH, MOTOR_SPEED, advanceLevel, buildLevel, checkOutput, checkWin,
  computeTransmission, createGearsState, generateLevel, gearsUsed, initPlaced, levelSeed,
  mulberry32, neighbors, placeGear, removeGear, restartLevel, teethAt, winScore,
  type GearsState, type LevelDef,
} from '../src/client/games/gears/logic.ts'

/** Deterministic mulberry32 rng (同实现独立副本，测试自包含)。 */
function rng(seed: number): () => number {
  return mulberry32(seed)
}

/** 用走廊铺满一条通关链：state.board 的 corridor 全放上齿轮。 */
function fillCorridor(def: LevelDef, state: GearsState, teeth: number): void {
  for (const cell of def.corridor) {
    expect(placeGear(state, cell.r, cell.c, teeth)).toBe(true)
  }
}

describe('gears logic', () => {
  it('mulberry32 确定且 levelSeed 随 seed/关卡变化', () => {
    const a = rng(42)
    const b = rng(42)
    for (let i = 0; i < 8; i += 1) expect(a()).toBe(b())
    expect(rng(1)()).not.toBe(rng(2)())
    expect(levelSeed(42, 1)).not.toBe(levelSeed(42, 2))
    expect(levelSeed(42, 1)).not.toBe(levelSeed(43, 1))
  })

  it('generateLevel 确定：同 seed 同布局，走廊永不撒障碍', () => {
    for (let level = 1; level <= 5; level += 1) {
      const x = generateLevel(level, rng(7))
      const y = generateLevel(level, rng(7))
      expect(x).toEqual(y)
    }
    const l1 = generateLevel(1, rng(7))
    const l1b = generateLevel(1, rng(8))
    expect(JSON.stringify(l1) === JSON.stringify(l1b)).toBe(false)
    for (let level = 1; level <= 5; level += 1) {
      const lv = generateLevel(level, rng(99))
      for (const cell of ([
        { r: lv.motor.r, c: lv.motor.c }, ...lv.outputs.map(o => o.pos),
      ] as const)) {
        const kind = lv.cells[cell.r]![cell.c]!
        expect(kind === 'motor' || kind === 'target').toBe(true)
      }
    }
  })

  it('邻接为上下左右四向并按边界裁剪', () => {
    expect(neighbors(0, 0, 3, 3)).toEqual([{ r: 1, c: 0 }, { r: 0, c: 1 }])
    expect(neighbors(1, 1, 3, 3)).toEqual([
      { r: 0, c: 1 }, { r: 2, c: 1 }, { r: 1, c: 0 }, { r: 1, c: 2 },
    ])
    expect(neighbors(2, 2, 3, 3)).toEqual([{ r: 1, c: 2 }, { r: 2, c: 1 }])
  })

  it('未放置时仅动力轮受电；放置相邻轮后啮合反转、转速按齿数比', () => {
    const state = createGearsState(1, 0, 7)
    const { motor } = state.board
    const empty = computeTransmission(state.board, state.placed)
    expect(empty[motor.r]![motor.c]).toEqual({ dir: 1, speed: MOTOR_SPEED })
    let poweredCount = 0
    for (const row of empty) for (const v of row) if (v !== null) poweredCount += 1
    expect(poweredCount).toBe(1) // 仅动力轮
    // 动力轮正右方放一枚 24 齿轮（12 齿动力轮）。
    const cell = { r: motor.r, c: motor.c + 1 }
    placeGear(state, cell.r, cell.c, 24)
    const spin = computeTransmission(state.board, state.placed)[cell.r]![cell.c]!
    expect(spin).toEqual({ dir: -1, speed: (MOTOR_SPEED * 12) / 24 })
    expect(teethAt(state.board, state.placed, motor.r, motor.c)).toBe(12)
  })

  it('方向沿链交替（奇偶），转速连乘望远镜式只取决于两端齿数', () => {
    // 手工 1×5 盘：动力 12 齿在 (0,0)，目标 8 齿在 (0,4)。
    const def: LevelDef = {
      w: 5, h: 1, motor: { r: 0, c: 0 }, motorTeeth: 12,
      outputs: [{ pos: { r: 0, c: 4 }, teeth: 8, dir: 'any', minSpeed: 0 }],
      corridor: [{ r: 0, c: 1 }, { r: 0, c: 2 }, { r: 0, c: 3 }],
      voidChance: 0,
    }
    const level = buildLevel(def, rng(1))
    const placed = initPlaced(level)
    placed[0]![1] = 8
    placed[0]![2] = 24
    placed[0]![3] = 16
    const info = computeTransmission(level, placed)
    expect(info[0]![1]!.dir).toBe(-1)
    expect(info[0]![2]!.dir).toBe(1)
    expect(info[0]![3]!.dir).toBe(-1)
    // 目标轮：距离 4（偶）→ 与动力同向；转速 = 60 * 12 / 8。
    expect(info[0]![4]).toEqual({ dir: 1, speed: (MOTOR_SPEED * 12) / 8 })
    // 换中间齿数不改变目标转速（连乘望远镜）。
    placed[0]![1] = 24
    placed[0]![2] = 8
    placed[0]![3] = 24
    const info2 = computeTransmission(level, placed)
    expect(info2[0]![4]!.speed).toBeCloseTo((MOTOR_SPEED * 12) / 8, 9)
  })

  it('放置/收回规则：仅空位可放、可换齿数、可收回，moves 计数', () => {
    const state = createGearsState(1, 0, 7)
    const lv = state.board
    // 找一个空位与一个障碍/固定格。
    let empty: { r: number; c: number } | null = null
    let nonEmpty: { r: number; c: number } | null = null
    outer: for (let r = 0; r < lv.h; r += 1) {
      for (let c = 0; c < lv.w; c += 1) {
        if (lv.cells[r]![c] === 'empty' && empty === null) empty = { r, c }
        if (lv.cells[r]![c] !== 'empty' && nonEmpty === null) nonEmpty = { r, c }
        if (empty !== null && nonEmpty !== null) break outer
      }
    }
    expect(empty).not.toBeNull()
    expect(placeGear(state, empty!.r, empty!.c, 8)).toBe(true)
    expect(state.placed[empty!.r]![empty!.c]).toBe(8)
    expect(placeGear(state, empty!.r, empty!.c, 16)).toBe(true) // 换齿数
    expect(state.placed[empty!.r]![empty!.c]).toBe(16)
    expect(placeGear(state, nonEmpty!.r, nonEmpty!.c, 8)).toBe(false)
    expect(placeGear(state, -1, 0, 8)).toBe(false)
    expect(removeGear(state, empty!.r, empty!.c)).toBe(true)
    expect(state.placed[empty!.r]![empty!.c]).toBeNull()
    expect(removeGear(state, empty!.r, empty!.c)).toBe(false)
    expect(state.moves).toBe(3)
  })

  it('过关判定：走廊铺满即胜（L1），方向/转速不达标判负（手工盘）', () => {
    const state = createGearsState(1, 0, 7)
    fillCorridor({
      w: 5, h: 4, motor: { r: 1, c: 0 }, motorTeeth: 12,
      outputs: [{ pos: { r: 1, c: 4 }, teeth: 12, dir: 'any', minSpeed: 0 }],
      corridor: [{ r: 1, c: 1 }, { r: 1, c: 2 }, { r: 1, c: 3 }], voidChance: 0.12,
    }, state, 12)
    const before = state.score
    expect(checkWin(state)).toBe(true)
    expect(state.score).toBe(before + winScore(1, gearsUsed(state.placed)))
    expect(checkWin(state)).toBe(false) // 只计分一次
    // 手工盘：距离奇数 → 目标逆时针；要求 'cw' 不达标。
    const oddDef: LevelDef = {
      w: 4, h: 1, motor: { r: 0, c: 0 }, motorTeeth: 12,
      outputs: [{ pos: { r: 0, c: 3 }, teeth: 12, dir: 'cw', minSpeed: 0 }],
      corridor: [{ r: 0, c: 1 }, { r: 0, c: 2 }], voidChance: 0,
    }
    const oddLevel = buildLevel(oddDef, rng(1))
    const oddPlaced = initPlaced(oddLevel)
    oddPlaced[0]![1] = 12
    oddPlaced[0]![2] = 12
    let check = checkOutput(oddLevel, oddPlaced, oddDef.outputs[0]!)
    expect(check.powered).toBe(true)
    expect(check.dir).toBe(-1)
    expect(check.met).toBe(false) // 方向不符
    // 转速阈值不可达：minSpeed 高于望远镜转速。
    const fastDef: LevelDef = {
      ...oddDef,
      outputs: [{ pos: { r: 0, c: 3 }, teeth: 24, dir: 'any', minSpeed: MOTOR_SPEED * 2 }],
    }
    const fastLevel = buildLevel(fastDef, rng(1))
    const fastPlaced = initPlaced(fastLevel)
    fastPlaced[0]![1] = 8
    fastPlaced[0]![2] = 8
    check = checkOutput(fastLevel, fastPlaced, fastDef.outputs[0]!)
    expect(check.powered).toBe(true)
    expect(check.met).toBe(false) // 转速不足
  })

  it('advanceLevel 推进、restartLevel 同布局回滚分数（确定性）', () => {
    const state = createGearsState(2, 0, 31)
    fillCorridor({
      w: 5, h: 4, motor: { r: 0, c: 0 }, motorTeeth: 12,
      outputs: [{ pos: { r: 3, c: 4 }, teeth: 8, dir: 'ccw', minSpeed: 0 }],
      corridor: [
        { r: 0, c: 1 }, { r: 1, c: 1 }, { r: 2, c: 1 }, { r: 3, c: 1 },
        { r: 3, c: 2 }, { r: 3, c: 3 },
      ], voidChance: 0.2,
    }, state, 12)
    expect(checkWin(state)).toBe(true)
    const wonScore = state.score
    const boardBefore = JSON.stringify(state.board)
    advanceLevel(state)
    expect(state.level).toBe(3)
    expect(state.status).toBe('playing')
    expect(state.levelStartScore).toBe(wonScore)
    expect(JSON.stringify(state.board)).not.toBe(boardBefore)
    advanceLevel(state) // 非 won：no-op
    expect(state.level).toBe(3)
    // 重开第 3 关：布局与刚生成的一致，分数回滚。
    const fresh = JSON.stringify(state.board)
    restartLevel(state)
    expect(JSON.stringify(state.board)).toBe(fresh)
    expect(state.score).toBe(wonScore)
    expect(state.status).toBe('playing')
  })

  it('候选齿数槽固定为 8/12/16/24', () => {
    expect([...CANDIDATE_TEETH]).toEqual([8, 12, 16, 24])
  })
})
