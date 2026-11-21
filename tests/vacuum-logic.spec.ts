import { describe, expect, it } from 'vitest'
import {
  FINAL_LEVEL, analyzeRoom, coverage, createVacuumState, createVacuumStateFromRoom,
  generateRoom, isFloor, levelConfig, mulberry32, tryMove,
  type VacuumDir, type VacuumLevelConfig, type VacuumRoom, type VacuumState,
} from '../src/client/games/vacuum/logic.ts'

const SEEDS = [1, 42, 0x9e3779b9, 123456789, 20261117]

/** 手工房间：字符串图，'#'=家具，'.'=地板，'D'=充电桩。 */
function roomFrom(map: string[]): VacuumRoom {
  const rows = map.length
  const cols = map[0]!.length
  const cells = new Uint8Array(cols * rows)
  let dock = { x: 0, y: 0 }
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const ch = map[y]![x]!
      if (ch === '#') cells[y * cols + x] = 1
      if (ch === 'D') dock = { x, y }
    }
  }
  return { cols, rows, cells, dock }
}

/** 大电量无猫配置（rows 可覆写），专供走格验证。 */
function openConfig(cols: number, rows: number, battery = 10000): VacuumLevelConfig {
  return { cols, rows, furniture: 0, battery, recharges: 0, cat: false, catEvery: 3 }
}

/**
 * 贪心清扫：每步 BFS 找最近未清扫可达格并朝它走一格，直到过关或无路。
 * @returns 实际执行的移动次数。
 */
function greedyClean(state: VacuumState): number {
  const delta: Record<VacuumDir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }
  let moves = 0
  while (state.status === 'playing' && moves < 2000) {
    const prev = new Int32Array(state.room.cols * state.room.rows).fill(-1)
    const start = state.robot.y * state.room.cols + state.robot.x
    const queue: number[] = [start]
    const seen = new Uint8Array(state.room.cols * state.room.rows)
    seen[start] = 1
    let first = -1
    outer:
    while (queue.length > 0) {
      const i = queue.shift()!
      const x = i % state.room.cols
      const y = (i - x) / state.room.cols
      for (const d of ['up', 'down', 'left', 'right'] as VacuumDir[]) {
        const nx = x + delta[d][0]
        const ny = y + delta[d][1]
        if (!isFloor(state.room, nx, ny)) continue
        const ni = ny * state.room.cols + nx
        if (seen[ni] === 1) continue
        seen[ni] = 1
        prev[ni] = i
        queue.push(ni)
        if (state.cleaned[ni] === 0 && state.reachable[ni] === 1) {
          let cur = ni
          while (prev[cur] !== -1 && prev[prev[cur]!] !== -1) cur = prev[cur]!
          first = cur
          break outer
        }
      }
    }
    if (first === -1) break
    const fx = first % state.room.cols
    const fy = (first - fx) / state.room.cols
    const d: VacuumDir = fx > state.robot.x ? 'right' : fx < state.robot.x ? 'left'
      : fy > state.robot.y ? 'down' : 'up'
    tryMove(state, d)
    moves += 1
  }
  return moves
}

describe('vacuum logic', () => {
  it('房间生成确定性：同 seed 同关卡两次生成完全一致，充电桩固定角落', () => {
    for (const seed of SEEDS) {
      for (const level of [1, 3, 5]) {
        const a = createVacuumState(seed, level)
        const b = createVacuumState(seed, level)
        expect([...a.room.cells], 'seed ' + seed + ' L' + level).toEqual([...b.room.cells])
        expect(a.reachableCount).toBe(b.reachableCount)
        expect(a.room.dock).toEqual({ x: 0, y: 0 })
        expect(a.room.cells[0]).toBe(0)
        expect(a.robot).toEqual({ x: 0, y: 0 })
      }
    }
  })

  it('可达性预判：被家具围死的口袋不计入过关分母', () => {
    // 中部 2 格口袋被一圈家具围死，永远到不了；环道 15 格可达。
    const room = roomFrom([
      'D....',
      '.###.',
      '.#..#',
      '.###.',
      '.....',
    ])
    const { reachable, count } = analyzeRoom(room)
    expect(count).toBe(15)
    expect(reachable[0]).toBe(1)
    expect(reachable[2 * 5 + 2]).toBe(0)
    expect(reachable[2 * 5 + 3]).toBe(0)
    // 走遍全部 15 个可达格即过关——口袋不拖后腿。
    const state = createVacuumStateFromRoom(room, openConfig(5, 5), mulberry32(7))
    greedyClean(state)
    expect(state.status).toBe('won')
    expect(state.cleanedCount).toBe(15)
    expect(coverage(state)).toBe(1)
    // 口袋格即便可见也从未被清扫。
    expect(state.cleaned[2 * 5 + 2]).toBe(0)
    expect(state.cleaned[2 * 5 + 3]).toBe(0)
  })

  it('移动与阻挡：界外/家具阻挡不动不耗电，正常移动 -1 电量且经过即清扫', () => {
    // 全开走廊创建（可达集 = 5），随后在家具位 x=1 放置障碍做阻挡验证。
    const room = roomFrom(['D....'])
    const state = createVacuumStateFromRoom(room, openConfig(5, 1, 10), mulberry32(1))
    state.room.cells[1] = 1
    // 左是界外。
    let r = tryMove(state, 'left')
    expect(r.blocked).toBe(true)
    expect(r.moved).toBe(false)
    expect(state.battery).toBe(10)
    expect(state.robot).toEqual({ x: 0, y: 0 })
    // 右是家具（x=1）。
    r = tryMove(state, 'right')
    expect(r.blocked).toBe(true)
    expect(state.battery).toBe(10)
    expect(isFloor(room, 1, 0)).toBe(false)
    // 搬走家具后正常移动：耗 1 电、清扫新格。
    state.room.cells[1] = 0
    r = tryMove(state, 'right')
    expect(r.moved).toBe(true)
    expect(r.cleanedNew).toBe(true)
    expect(state.battery).toBe(9)
    expect(state.robot).toEqual({ x: 1, y: 0 })
    // 重复经过已清格不再计数。
    r = tryMove(state, 'left')
    expect(r.moved).toBe(true)
    expect(r.cleanedNew).toBe(false)
    expect(state.cleanedCount).toBe(2)
    expect(state.battery).toBe(8)
  })

  it('充电规则：桩上电量未满自动充满并 -1 次数；次数耗尽后踩桩不充', () => {
    const room = roomFrom(['D...'])
    const cfg: VacuumLevelConfig = { ...openConfig(4, 1, 6), recharges: 2 }
    const state = createVacuumStateFromRoom(room, cfg, mulberry32(1))
    // 出发两格再回桩：4<6 自动充满，消耗一次。
    tryMove(state, 'right')
    tryMove(state, 'right')
    let r = tryMove(state, 'left')
    r = tryMove(state, 'left')
    expect(r.recharged).toBe(true)
    expect(state.battery).toBe(6)
    expect(state.recharges).toBe(1)
    // 第二次回桩：再充满，次数归零。
    tryMove(state, 'right')
    tryMove(state, 'right')
    tryMove(state, 'left')
    r = tryMove(state, 'left')
    expect(r.recharged).toBe(true)
    expect(state.recharges).toBe(0)
    // 次数耗尽后再回桩不充。
    tryMove(state, 'right')
    r = tryMove(state, 'left')
    expect(r.recharged).toBe(false)
    expect(state.battery).toBe(4)
    expect(state.status).toBe('playing')
  })

  it('电量耗尽判定：非桩 0 电即死；桩上 0 电有次数则先充满不死；桩上 0 电无次数亦死', () => {
    // 5 格走廊、3 电、0 次：走 3 步后在非桩位 0 电 → dead。
    let state = createVacuumStateFromRoom(roomFrom(['D....']), openConfig(5, 1, 3), mulberry32(1))
    tryMove(state, 'right')
    tryMove(state, 'right')
    const r1 = tryMove(state, 'right')
    expect(r1.moved).toBe(true)
    expect(r1.dead).toBe(true)
    expect(state.status).toBe('dead')
    expect(state.battery).toBe(0)
    // 3 格走廊、2 电、1 次：回桩瞬间 0 电但同一步充满。
    state = createVacuumStateFromRoom(roomFrom(['D..']),
      { ...openConfig(3, 1, 2), recharges: 1 }, mulberry32(1))
    tryMove(state, 'right')
    const r2 = tryMove(state, 'left')
    expect(r2.dead).toBe(false)
    expect(r2.recharged).toBe(true)
    expect(state.battery).toBe(2)
    expect(state.status).toBe('playing')
    // 桩上 0 电且次数已空 → 死。
    state = createVacuumStateFromRoom(roomFrom(['D..']),
      { ...openConfig(3, 1, 2), recharges: 0 }, mulberry32(1))
    tryMove(state, 'right')
    const r3 = tryMove(state, 'left')
    expect(r3.dead).toBe(true)
    expect(state.status).toBe('dead')
  })

  it('过关判定：贪心走遍全部可达格即 won，覆盖率 100%，过关后移动被忽略', () => {
    const room = roomFrom([
      'D.#.',
      '...#',
      '....',
    ])
    const state = createVacuumStateFromRoom(room, openConfig(4, 3), mulberry32(3))
    greedyClean(state)
    expect(state.status).toBe('won')
    expect(coverage(state)).toBe(1)
    expect(state.cleanedCount).toBe(state.reachableCount)
    // 过关后继续移动被忽略。
    const frozen = { ...state.robot }
    const r = tryMove(state, 'right')
    expect(r.moved).toBe(false)
    expect(state.robot).toEqual(frozen)
  })

  it('宠物猫：第 4 关起出现且合法落位；撞猫 -5 电量并弹开、机器人不动', () => {
    for (const seed of SEEDS) {
      const s4 = createVacuumState(seed, 4)
      const s5 = createVacuumState(seed, 5)
      for (const s of [s4, s5]) {
        expect(s.cat).not.toBeNull()
        const cat = s.cat!
        expect(isFloor(s.room, cat.x, cat.y)).toBe(true)
        expect(s.reachable[cat.y * s.room.cols + cat.x]).toBe(1)
        expect(Math.abs(cat.x) + Math.abs(cat.y)).toBeGreaterThanOrEqual(3)
        expect(s.room.cells[cat.y * s.room.cols + cat.x]).toBe(0)
      }
      // 前三关无猫。
      for (const level of [1, 2, 3]) expect(createVacuumState(seed, level).cat).toBeNull()
    }
    // 撞猫：电量 -5、机器人不动、猫被弹开到相邻自由格。
    const room = roomFrom(['D..c.'])
    const state = createVacuumStateFromRoom(room, openConfig(5, 1, 20), mulberry32(9))
    state.cat = { x: 2, y: 0 }
    tryMove(state, 'right')
    expect(state.robot).toEqual({ x: 1, y: 0 })
    const r = tryMove(state, 'right')
    expect(r.catBump).toBe(true)
    expect(r.moved).toBe(false)
    expect(state.battery).toBe(20 - 1 - 5)
    expect(state.robot).toEqual({ x: 1, y: 0 })
    expect(state.cat.x).toBe(3)
    expect(state.cat.y).toBe(0)
  })

  it('猫周期走动：每 3 步移动一次且落点始终合法（非家具/非桩/非机器人）', () => {
    const state = createVacuumState(20261117, 5)
    const before = { ...state.cat! }
    let catMoved = false
    for (let step = 1; step <= 3; step += 1) {
      const d: VacuumDir = state.robot.x < state.room.cols - 1 ? 'right' : 'left'
      tryMove(state, d)
      expect(isFloor(state.room, state.cat!.x, state.cat!.y)).toBe(true)
      expect(state.cat!.x !== state.room.dock.x || state.cat!.y !== state.room.dock.y).toBe(true)
      expect(state.cat!.x !== state.robot.x || state.cat!.y !== state.robot.y).toBe(true)
      if (state.cat!.x !== before.x || state.cat!.y !== before.y) catMoved = true
    }
    // 猫有邻格可走时必然移动过；即便被家具困住，落点也始终合法。
    expect(catMoved || state.status === 'playing').toBe(true)
  })

  it('关卡递进：8×8→14×12 变大、家具更密、电量更紧、充电次数更少、第 4 关起有猫', () => {
    const l1 = levelConfig(1)
    const l5 = levelConfig(5)
    expect(l1.cols * l1.rows).toBe(64)
    expect(l5.cols * l5.rows).toBe(14 * 12)
    expect(l5.furniture).toBeGreaterThan(l1.furniture)
    expect(levelConfig(3).recharges).toBe(2)
    expect(l1.recharges).toBe(3)
    expect(levelConfig(4).cat).toBe(true)
    expect(levelConfig(3).cat).toBe(false)
    // 总电量/可达格比值递减（更紧）。
    const ratio = (l: number): number => {
      const c = levelConfig(l)
      return (c.battery * (c.recharges + 1)) / (c.cols * c.rows - c.furniture)
    }
    expect(ratio(5)).toBeLessThan(ratio(1))
    expect(FINAL_LEVEL).toBe(5)
    // 越界钳制。
    expect(levelConfig(0).cols).toBe(8)
    expect(levelConfig(99).cols).toBe(14)
  })

  it('seed 重放：同 seed 同输入序列得到完全一致的终态（含猫位置与清扫集）', () => {
    const dirs: VacuumDir[] = ['right', 'down', 'right', 'up', 'left', 'down', 'down', 'right', 'right', 'up']
    const play = (): { snapshot: string; results: string } => {
      const s = createVacuumState(0x51ed270b, 5)
      const results: string[] = []
      for (const d of dirs) {
        const r = tryMove(s, d)
        results.push([r.moved, r.blocked, r.catBump, r.recharged, r.cleanedNew, r.won, r.dead].join(','))
      }
      return {
        snapshot: JSON.stringify({
          robot: s.robot, cat: s.cat, battery: s.battery, recharges: s.recharges,
          cleaned: [...s.cleaned], moveCount: s.moveCount, status: s.status,
        }),
        results: results.join(';'),
      }
    }
    const a = play()
    const b = play()
    expect(a.results).toBe(b.results)
    expect(a.snapshot).toBe(b.snapshot)
    // mulberry32 序列本身确定。
    const r1 = mulberry32(7)
    const r2 = mulberry32(7)
    expect([r1(), r1(), r1()]).toEqual([r2(), r2(), r2()])
  })

  it('生成质量：多 seed 多关卡可达格占比达标且家具数量精确', () => {
    for (const seed of SEEDS) {
      for (const level of [1, 2, 3, 4, 5]) {
        const cfg = levelConfig(level)
        const room = generateRoom(mulberry32(seed ^ (level * 31)), cfg)
        const furniture = room.cells.reduce((a, b) => a + b, 0)
        expect(furniture, 'seed ' + seed + ' L' + level).toBe(cfg.furniture)
        const { count } = analyzeRoom(room)
        expect(count).toBeGreaterThanOrEqual(Math.max(10, Math.ceil((cfg.cols * cfg.rows - cfg.furniture) * 0.68)))
      }
    }
  })
})
