import { describe, expect, it } from 'vitest'
import {
  BOARD,
  FLEET,
  aiChooseShot,
  aiFire,
  canPlace,
  fireAt,
  heatMap,
  huntTargets,
  isLegalFleet,
  mulberry32,
  playerFire,
  randomFleet,
  shipCells,
  shipIndexAt,
  startBattle,
  sunkFlags,
  type Placement,
  type SideState,
} from '../src/client/games/battleship/logic.ts'

function emptyShots(): number[][] {
  return Array.from({ length: BOARD }, () => Array.from({ length: BOARD }, () => 0))
}

function makeSide(fleet: Placement[]): SideState {
  return { fleet, shots: emptyShots() }
}

describe('battleship logic', () => {
  it('mulberry32 is seed-deterministic', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    for (let i = 0; i < 20; i += 1) expect(a()).toBe(b())
    expect(mulberry32(1)()).not.toBe(mulberry32(2)())
  })

  it('randomFleet is deterministic and always legal (bounds/no overlap/no touch)', () => {
    for (const seed of [0, 1, 7, 99, 123456, 0xffff_ffff]) {
      const fleet = randomFleet(seed)
      expect(fleet).toHaveLength(FLEET.length)
      expect(isLegalFleet(fleet)).toBe(true)
      expect(randomFleet(seed)).toEqual(fleet)
    }
  })

  it('canPlace rejects out-of-bounds, overlap and touching (side & diagonal)', () => {
    const carrier: Placement = { row: 0, col: 0, horizontal: true }
    // 越界：横向航母锚点 col=6 会伸出海图。
    expect(canPlace([], { row: 0, col: 6, horizontal: true }, 5)).toBe(false)
    // 重叠：驱逐舰压在航母格上。
    expect(canPlace([carrier], { row: 0, col: 1, horizontal: true }, 2)).toBe(false)
    // 贴边：驱逐舰在航母正下方（间隔 1 行）。
    expect(canPlace([carrier], { row: 1, col: 0, horizontal: true }, 2)).toBe(false)
    // 对角贴边。
    expect(canPlace([carrier], { row: 1, col: 5, horizontal: true }, 2)).toBe(false)
    // 合法：隔一格以上。
    expect(canPlace([carrier], { row: 2, col: 0, horizontal: true }, 2)).toBe(true)
    expect(canPlace([carrier], { row: 0, col: 7, horizontal: true }, 2)).toBe(true)
    expect(isLegalFleet([carrier])).toBe(false)
  })

  it('fireAt marks miss/hit, reports sunk ship names, and repeat leaves state intact', () => {
    // 与 FLEET 对齐的整队：驱逐舰（下标 4）纵向占 (5,5)-(6,5)。
    const fleet = [
      { row: 0, col: 0, horizontal: true },
      { row: 2, col: 0, horizontal: true },
      { row: 4, col: 0, horizontal: true },
      { row: 6, col: 0, horizontal: true },
      { row: 5, col: 5, horizontal: false },
    ]
    expect(isLegalFleet(fleet)).toBe(true)
    const side = makeSide(fleet)
    expect(fireAt(side, 0, 9)).toEqual({ kind: 'miss', sunk: null })
    expect(side.shots[0]![9]).toBe(1)
    expect(shipIndexAt(side, 6, 5)).toBe(4)
    expect(fireAt(side, 5, 5)).toEqual({ kind: 'hit', sunk: null })
    expect(fireAt(side, 5, 5).kind).toBe('repeat')
    expect(fireAt(side, 0, 9).kind).toBe('repeat')
    expect(fireAt(side, 6, 5)).toEqual({ kind: 'hit', sunk: '驱逐舰' })
    expect(sunkFlags(side)).toEqual([false, false, false, false, true])
  })

  it('heatMap is symmetric on an untouched board and zero on fired cells', () => {
    const side = makeSide(randomFleet(11))
    const w = heatMap(side)
    let sum = 0
    for (let r = 0; r < BOARD; r += 1) {
      for (let c = 0; c < BOARD; c += 1) {
        sum += w[r]![c]!
        // 转置对称与 180° 旋转对称。
        expect(w[r]![c]).toBe(w[c]![r])
        expect(w[r]![c]).toBe(w[BOARD - 1 - r]![BOARD - 1 - c])
      }
    }
    expect(sum).toBeGreaterThan(0)
    // 开过炮的格（无论 miss/hit）权重归零。
    fireAt(side, 0, 0)
    fireAt(side, 9, 9)
    const w2 = heatMap(side)
    expect(w2[0]![0]).toBe(0)
    expect(w2[9]![9]).toBe(0)
  })

  it('huntTargets lists four-way neighbors of unresolved hits only', () => {
    // 驱逐舰横向占 (4,4)-(4,5)，其余舰远离。
    const fleet = [
      { row: 0, col: 0, horizontal: true },
      { row: 2, col: 0, horizontal: true },
      { row: 6, col: 0, horizontal: true },
      { row: 8, col: 0, horizontal: true },
      { row: 4, col: 4, horizontal: true },
    ]
    expect(isLegalFleet(fleet)).toBe(true)
    const side = makeSide(fleet)
    expect(huntTargets(side)).toEqual([])
    fireAt(side, 4, 4)
    expect(huntTargets(side).sort((a, b) => a[0] - b[0] || a[1] - b[1])).toEqual([[3, 4], [4, 3], [4, 5], [5, 4]])
    // 打沉后该舰不再产生追击目标。
    fireAt(side, 4, 5)
    expect(huntTargets(side)).toEqual([])
  })

  it('aiChooseShot never repeats a fired cell and L5 hunts adjacent to a hit', () => {
    const side = makeSide(randomFleet(3))
    const rand = mulberry32(7)
    for (let i = 0; i < 60; i += 1) {
      const [r, c] = aiChooseShot(side, 1, rand)
      expect(side.shots[r]![c]).toBe(0)
      fireAt(side, r, c)
    }
    // L5：命中未沉的格旁必被优先锁定。
    const hunt = makeSide([{ row: 5, col: 5, horizontal: true }])
    fireAt(hunt, 5, 6)
    const wanted = new Set(['4,6', '6,6', '5,5', '5,7'])
    for (let i = 0; i < 12; i += 1) {
      const [r, c] = aiChooseShot(hunt, 5, mulberry32(100 + i))
      expect(wanted.has(r + ',' + c)).toBe(true)
    }
  })

  it('battle turn flow: hit keeps the turn, miss hands it over', () => {
    const b = startBattle(5, randomFleet(5), 1)
    expect(b.turn).toBe('player')
    // 找 AI 海域的一格水与一格舰：先打舰（命中不换手）。
    const shipCell = shipCells(b.ai.fleet[4]!, FLEET[4]!.size)[0]!
    let water: [number, number] = [0, 0]
    outer: for (let r = 0; r < BOARD; r += 1) {
      for (let c = 0; c < BOARD; c += 1) {
        if (shipIndexAt(b.ai, r, c) < 0) { water = [r, c]; break outer }
      }
    }
    const hit = playerFire(b, shipCell[0], shipCell[1])
    expect(hit.kind).toBe('hit')
    expect(b.turn).toBe('player')
    const miss = playerFire(b, water[0], water[1])
    expect(miss.kind).toBe('miss')
    expect(b.turn).toBe('ai')
    // AI 开炮直到 miss 换回玩家（有界循环）。
    let guard = 0
    while (b.turn === 'ai' && guard < 100) {
      aiFire(b)
      guard += 1
    }
    expect(b.turn).toBe('player')
    expect(b.phase).toBe('battle')
  })

  it('all enemy ships sunk wins the battle for the player', () => {
    const b = startBattle(8, randomFleet(8), 1)
    for (let i = 0; i < b.ai.fleet.length; i += 1) {
      for (const [r, c] of shipCells(b.ai.fleet[i]!, FLEET[i]!.size)) {
        const res = playerFire(b, r, c)
        expect(res.kind).toBe('hit')
      }
    }
    expect(sunkFlags(b.ai).every(Boolean)).toBe(true)
    expect(b.phase).toBe('won')
  })

  it('a fully hunted player fleet loses at L5 within the board budget', () => {
    const b = startBattle(999, randomFleet(5), 5)
    let guard = 0
    while (b.phase === 'battle' && guard < 200) {
      aiFire(b)
      guard += 1
    }
    expect(b.phase).toBe('lost')
    expect(guard).toBeLessThan(BOARD * BOARD)
  })

  it('same seed replays the identical battle including AI shots', () => {
    const fleet = randomFleet(21)
    const play = (seed: number): { log: string[], phase: string } => {
      const b = startBattle(seed, fleet, 5)
      const log: string[] = []
      // 脚本：逐个打 AI 舰格（命中），再打一格水（换手给 AI）。
      const shipHits: Array<[number, number]> = []
      for (let i = 0; i < b.ai.fleet.length; i += 1) {
        for (const cell of shipCells(b.ai.fleet[i]!, FLEET[i]!.size)) shipHits.push(cell)
      }
      const water: Array<[number, number]> = []
      outer: for (let r = 0; r < BOARD; r += 1) {
        for (let c = 0; c < BOARD; c += 1) {
          if (shipIndexAt(b.ai, r, c) < 0) water.push([r, c])
          if (water.length === shipHits.length) break outer
        }
      }
      let script = 0
      let guard = 0
      while (b.phase === 'battle' && guard < 500) {
        guard += 1
        if (b.turn === 'player') {
          const [r, c] = script % 2 === 0 ? shipHits[script / 2]! : water[(script - 1) / 2]!
          script += 1
          playerFire(b, r, c)
          log.push('P' + r + ',' + c)
        } else {
          const res = aiFire(b)
          log.push('A' + res.row + ',' + res.col + ':' + res.kind + (res.sunk ?? ''))
        }
      }
      return { log, phase: b.phase }
    }
    const first = play(4242)
    const second = play(4242)
    expect(first.log).toEqual(second.log)
    expect(first.phase).toBe('won')
    // 玩家按脚本命沉全部舰，AI 只在 miss 间隙出手。
    expect(first.log.filter(l => l[0] === 'A').length).toBeGreaterThan(0)
  })
})
