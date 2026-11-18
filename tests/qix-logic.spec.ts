import { describe, expect, it } from 'vitest'
import {
  COLS, ROWS, LIVES, LEVELS, SCORE_PER_CELL, LEVEL_CLEAR_BONUS,
  createQixState, setHeld, stepPlayer, stepQix, advance, startNextLevel,
  ownedRatio, interiorCount, trailHit, replay, signature, matchWon,
  qixCountFor, qixStepMsFor, targetFor, isBelt,
  type QixState,
} from '../src/client/games/qix/logic.ts'

const I = (x: number, y: number): number => y * COLS + x

/** 把墨怪手动摆到远离玩家笔迹的位置（隔离闭合填充测试的随机性）。 */
function parkQix(state: QixState): void {
  state.qix = [
    { x: 5, y: 5, dx: 1, dy: 0 },
    { x: 35, y: 20, dx: -1, dy: 0 },
    { x: 10, y: 20, dx: 1, dy: 1 },
  ]
}

/** 从顶边中点出发：下 8、右 10、上回边，围出 x21..29 × y1..7 的空矩形。 */
function carveLoop(state: QixState): void {
  parkQix(state)
  setHeld(state, 'down', true)
  for (let i = 0; i < 8; i += 1) stepPlayer(state)
  setHeld(state, 'down', false)
  setHeld(state, 'right', true)
  for (let i = 0; i < 10; i += 1) stepPlayer(state)
  setHeld(state, 'right', false)
  setHeld(state, 'up', true)
  for (let i = 0; i < 7; i += 1) stepPlayer(state)
  // 第 8 步向上进入安全带 → 闭合。
  expect(stepPlayer(state)).toBe(true)
}

describe('qix logic', () => {
  it('初始盘面：安全带已占、内部全空、比例 0、命 3、玩家在顶边、墨怪在内部空格', () => {
    const state = createQixState(7)
    expect(state.level).toBe(1)
    expect(state.lives).toBe(LIVES)
    expect(state.status).toBe('playing')
    expect(state.mode).toBe('edge')
    expect(state.px).toBe(Math.floor(COLS / 2))
    expect(state.py).toBe(0)
    let beltOwned = 0
    let interiorOwned = 0
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const v = state.own[I(x, y)]
        if (isBelt(x, y)) {
          if (v === 1) beltOwned += 1
        } else if (v === 1) interiorOwned += 1
      }
    }
    expect(beltOwned).toBe(2 * COLS + 2 * (ROWS - 2))
    expect(interiorOwned).toBe(0)
    expect(ownedRatio(state)).toBe(0)
    expect(state.qix).toHaveLength(qixCountFor(1))
    for (const q of state.qix) {
      expect(isBelt(q.x, q.y)).toBe(false)
      expect(state.own[I(q.x, q.y)]).toBe(0)
    }
    expect(interiorCount()).toBe((COLS - 2) * (ROWS - 2))
  })

  it('边缘滑行：按住方向在安全带上逐格移动，不产生笔迹、不切换模式', () => {
    const state = createQixState(1)
    parkQix(state)
    setHeld(state, 'right', true)
    for (let i = 0; i < 5; i += 1) expect(stepPlayer(state)).toBe(true)
    expect(state.px).toBe(Math.floor(COLS / 2) + 5)
    expect(state.py).toBe(0)
    expect(state.mode).toBe('edge')
    expect(state.trail).toHaveLength(0)
    // 撞到角落出界：不移动。
    const state2 = createQixState(1)
    setHeld(state2, 'up', true)
    expect(stepPlayer(state2)).toBe(false)
    expect(state2.py).toBe(0)
  })

  it('切入状态机：从边缘迈向空格转 draw、记录笔迹、禁止 180° 掉头', () => {
    const state = createQixState(3)
    parkQix(state)
    setHeld(state, 'down', true)
    expect(stepPlayer(state)).toBe(true)
    expect(state.mode).toBe('draw')
    expect(state.trail).toEqual([I(20, 0), I(20, 1)])
    expect(state.drawStart).toEqual({ x: 20, y: 0 })
    stepPlayer(state)
    stepPlayer(state)
    expect(state.py).toBe(3)
    // 掉头：只按住 up 时，目标格是自己的笔迹 → 拒绝移动。
    setHeld(state, 'down', false)
    setHeld(state, 'up', true)
    expect(stepPlayer(state)).toBe(false)
    expect(state.py).toBe(3)
    // 垂直转向合法：向左拐进空地。
    setHeld(state, 'up', false)
    setHeld(state, 'left', true)
    expect(stepPlayer(state)).toBe(true)
    expect(state.px).toBe(19)
    expect(state.trail).toContain(I(19, 3))
  })

  it('闭合填充：回边即闭合，不含墨怪一侧整块归己、含墨怪一侧留空、计分并回到沿边', () => {
    const state = createQixState(11)
    carveLoop(state)
    expect(state.status).toBe('playing')
    expect(state.mode).toBe('edge')
    expect(state.trail).toHaveLength(0)
    expect(state.px).toBe(30)
    expect(state.py).toBe(0)
    // 围住的 9×7=63 格 + 笔迹 25 个内部格全部归己。
    expect(state.own[I(25, 4)]).toBe(1)
    expect(state.own[I(21, 1)]).toBe(1)
    expect(state.own[I(29, 7)]).toBe(1)
    // 两侧墨怪所在区域保持为空。
    expect(state.own[I(5, 5)]).toBe(0)
    expect(state.own[I(35, 20)]).toBe(0)
    expect(state.own[I(12, 10)]).toBe(0)
    const ratio = ownedRatio(state)
    expect(ratio).toBeCloseTo(88 / interiorCount(), 10)
    expect(state.score).toBe((25 + 63) * SCORE_PER_CELL)
    expect(state.lastFillCount).toBe(63)
  })

  it('过关判定与关卡递进：占满目标即过关，下一关更快更多、盘面重置、奖励入账', () => {
    const state = createQixState(13)
    // 除第 20 列外全部内部格直接置为己占，墨怪关进第 19 列旁的空格。
    for (let y = 1; y < ROWS - 1; y += 1) {
      for (let x = 1; x < COLS - 1; x += 1) {
        if (x !== 20) state.own[I(x, y)] = 1
      }
    }
    state.qix = [{ x: 19, y: 5, dx: 0, dy: 1 }]
    setHeld(state, 'down', true)
    let guard = 0
    do {
      stepPlayer(state)
      guard += 1
    } while (state.mode === 'draw' && guard < 60)
    expect(state.status).toBe('levelClear')
    expect(matchWon(state)).toBe(false)
    const scoreBefore = state.score
    startNextLevel(state)
    expect(state.level).toBe(2)
    expect(state.score).toBe(scoreBefore + 1 * LEVEL_CLEAR_BONUS)
    expect(state.lives).toBe(LIVES)
    expect(ownedRatio(state)).toBe(0)
    expect(state.qix).toHaveLength(qixCountFor(2))
    expect(qixStepMsFor(2)).toBeLessThan(qixStepMsFor(1))
    expect(targetFor(2)).toBeGreaterThan(targetFor(1))
    expect(startNextLevel(state)).toBeUndefined() // 非 levelClear 时是 no-op
    expect(state.level).toBe(2)
  })

  it('最后一关过关即整场胜利，startNextLevel 不再推进', () => {
    const state = createQixState(17)
    state.level = LEVELS
    state.status = 'levelClear'
    expect(matchWon(state)).toBe(true)
    startNextLevel(state)
    expect(state.level).toBe(LEVELS)
  })

  it('墨怪运动确定性：同 seed 同 dt 序列签名一致，异 seed 不同', () => {
    const drive = (seed: number): QixState => {
      const s = createQixState(seed)
      for (let c = 0; c < 400; c += 1) advance(s, 50)
      return s
    }
    expect(signature(drive(42))).toBe(signature(drive(42)))
    expect(signature(drive(42))).not.toBe(signature(drive(43)))
  })

  it('墨怪游荡约束：长时间运动后仍在界内且只落在未占领格上', () => {
    const state = createQixState(99)
    for (let c = 0; c < 2000; c += 1) {
      advance(state, 50)
      if (state.status !== 'playing') break
      for (const q of state.qix) {
        expect(q.x).toBeGreaterThanOrEqual(0)
        expect(q.x).toBeLessThan(COLS)
        expect(q.y).toBeGreaterThanOrEqual(0)
        expect(q.y).toBeLessThan(ROWS)
        expect(state.own[I(q.x, q.y)]).toBe(0)
      }
    }
  })

  it('笔迹碰撞丢命：墨怪贴上笔迹即命-1、笔迹撤除、玩家回到起笔边缘格', () => {
    const state = createQixState(23)
    // 困住一只墨怪在 (22,1)：除 (21,*) 外的邻格全部置占，它只能横向贴过来。
    state.qix = [{ x: 22, y: 1, dx: 1, dy: 0 }]
    for (const [bx, by] of [[23, 0], [23, 1], [23, 2], [22, 0], [22, 2]] as const) {
      state.own[I(bx, by)] = 1
    }
    setHeld(state, 'down', true)
    stepPlayer(state) // 笔迹 (20,0)(20,1)，玩家 (20,1)。
    expect(state.trail).toHaveLength(2)
    stepQix(state) // 墨怪被迫走到 (21,*)，与笔迹相邻 → 命中。
    expect(state.lives).toBe(2)
    expect(state.trail).toHaveLength(0)
    expect(state.mode).toBe('edge')
    expect(state.px).toBe(20)
    expect(state.py).toBe(0)
    expect(trailHit(state)).toBe(false) // 笔迹已撤除。
    expect(state.status).toBe('playing')
  })

  it('命尽失败：第三条笔迹被切断后 status 变 gameover 且 advance 停止推进', () => {
    const state = createQixState(29)
    state.lives = 1
    state.qix = [{ x: 22, y: 1, dx: 1, dy: 0 }]
    for (const [bx, by] of [[23, 0], [23, 1], [23, 2], [22, 0], [22, 2]] as const) {
      state.own[I(bx, by)] = 1
    }
    setHeld(state, 'down', true)
    stepPlayer(state)
    stepQix(state)
    expect(state.lives).toBe(0)
    expect(state.status).toBe('gameover')
    const sig = signature(state)
    advance(state, 500)
    stepPlayer(state)
    expect(signature(state)).toBe(sig)
  })

  it('确定性重放：同一按键日志 + 固定 dt 完整复现局面', () => {
    const drive = (seed: number, record: boolean): { s: QixState, log: ReturnType<typeof createLog> } => {
      const s = createQixState(seed)
      const log = createLog()
      const script: Array<[number, string, boolean]> = [
        [10, 'right', true], [90, 'right', false], [120, 'down', true],
        [200, 'down', false], [210, 'left', true], [280, 'left', false],
        [300, 'up', true], [360, 'up', false],
      ]
      let next = 0
      for (let c = 0; c < 450; c += 1) {
        while (next < script.length && script[next]![0] === c) {
          const ev = script[next]!
          setHeld(s, ev[1] as 'up', ev[2])
          if (record) log.push({ cycle: c, dir: ev[1] as 'up', down: ev[2] })
          next += 1
        }
        advance(s, 50)
        if (s.status !== 'playing') break
      }
      return { s, log }
    }
    const createLog = (): Array<{ cycle: number, dir: 'up', down: boolean }> => []
    const first = drive(5, true)
    const replayed = replay(5, first.log, 450, 50)
    expect(signature(replayed)).toBe(signature(first.s))
    // 重放也覆盖 inputLog 本身（日志再重放一层仍一致）。
    const again = replay(5, replayed.inputLog, 450, 50)
    expect(signature(again)).toBe(signature(first.s))
  })
})
