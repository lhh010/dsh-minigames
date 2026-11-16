import { describe, expect, it } from 'vitest'
import {
  LEVELS,
  applySolution,
  createGameState,
  effHeight,
  inventoryLeft,
  mulberry32,
  pipColors,
  placePiece,
  placeReject,
  removePiece,
  resetToBuild,
  scoreFor,
  startChain,
  stepChain,
  undo,
  type Level,
} from '../src/client/games/dominorun/logic.ts'

/** 跑完连锁直到终态，收集事件序列。 */
function runChain(state: ReturnType<typeof createGameState>): string[] {
  startChain(state)
  const events: string[] = []
  for (let i = 0; i < 200; i += 1) {
    const ev = stepChain(state)
    if (ev.kind === 'fall') events.push('fall' + ev.x)
    else if (ev.kind === 'win') { events.push('win'); break }
    else if (ev.kind === 'break') { events.push('break@' + ev.from); break }
    else break
  }
  return events
}

describe('dominorun logic', () => {
  it('放置合法性：支撑面 / 沟壑 / 占用 / 起终点 / 越界', () => {
    const state = createGameState(1, 7) // 一线之沟：第 5 列是沟壑
    const pieces = state.pieces
    const used = state.used
    expect(placeReject(state.level, pieces, used, -1, 'domino')).toBe('超出盘面')
    expect(placeReject(state.level, pieces, used, 99, 'domino')).toBe('超出盘面')
    expect(placeReject(state.level, pieces, used, 0, 'domino')).toBe('起点 / 终点列不可放置')
    expect(placeReject(state.level, pieces, used, 13, 'domino')).toBe('起点 / 终点列不可放置')
    expect(placeReject(state.level, pieces, used, 5, 'domino')).toBe('此处需要实心支撑')
    expect(placeReject(state.level, pieces, used, 1, 'bridge')).toBe('桥板只能横跨沟壑')
    expect(placePiece(state, 1, 'domino')).toBeNull()
    expect(placeReject(state.level, pieces, used, 1, 'domino')).toBe('该列已有件')
  })

  it('库存账目：放置扣减、移回补回、耗尽拒绝', () => {
    const state = createGameState(1, 7) // bridge × 1
    expect(placePiece(state, 5, 'bridge')).toBeNull()
    expect(inventoryLeft(state)).toEqual({ domino: 11, bridge: 0, booster: 0 })
    expect(placePiece(state, 5, 'bridge')).not.toBeNull() // 已占用
    expect(removePiece(state, 5)).toBe(true)
    expect(inventoryLeft(state)).toEqual({ domino: 11, bridge: 1, booster: 0 })
    expect(placePiece(state, 5, 'bridge')).toBeNull()
    expect(placePiece(state, 5, 'bridge')).toBe('该列已有件')
    // 桥已用完：换一个沟壑列（自定义 3 宽沟的第 6 列）也放不下
    const wide = createGameState(4, 7)
    expect(placePiece(wide, 6, 'bridge')).toBeNull()
    expect(placePiece(wide, 7, 'bridge')).toBeNull()
    expect(placePiece(wide, 8, 'bridge')).toBe('库存不足')
  })

  it('撤回：逆操作恢复盘面与库存，链动期不可撤', () => {
    const state = createGameState(1, 7)
    placePiece(state, 1, 'domino')
    placePiece(state, 2, 'domino')
    removePiece(state, 1)
    expect(state.pieces.size).toBe(1)
    expect(undo(state)).toBe(true) // 撤销 remove → 1 列骨牌回来
    expect(state.pieces.has(1)).toBe(true)
    expect(inventoryLeft(state).domino).toBe(9)
    expect(undo(state)).toBe(true)
    expect(undo(state)).toBe(true)
    expect(state.pieces.size).toBe(0)
    expect(inventoryLeft(state)).toEqual({ domino: 11, bridge: 1, booster: 0 })
    expect(undo(state)).toBe(false)
    startChain(state)
    expect(undo(state)).toBe(false)
  })

  it('基本连锁：直道参考摆法逐列倒下并撞响铃铛', () => {
    const state = applySolution(0, 1)
    const events = runChain(state)
    expect(events).toEqual([
      'fall1', 'fall2', 'fall3', 'fall4', 'fall5', 'fall6', 'fall7',
      'fall8', 'fall9', 'fall10', 'fall11', 'fall12', 'win',
    ])
    expect(state.outcome).toBe('won')
  })

  it('桥跨沟：不铺桥则链断在沟前，铺桥恰好在同一高度面传导', () => {
    const noBridge = createGameState(1, 3)
    for (let x = 1; x <= 4; x += 1) placePiece(noBridge, x, 'domino')
    placePiece(noBridge, 6, 'domino')
    expect(runChain(noBridge)).toEqual(['fall1', 'fall2', 'fall3', 'fall4', 'break@4'])
    expect(noBridge.outcome).toBe('lost')

    const withBridge = applySolution(1, 3)
    expect(withBridge.outcome).toBeNull()
    expect(effHeight(withBridge.level, 5)).toBe(2) // 沟壑有效高度 = 左侧平台
    expect(runChain(withBridge).at(-1)).toBe('win')
  })

  it('加速器：优先跳过 1 格缺口，无跳点时退回相邻', () => {
    const state = applySolution(3, 5) // 双缝跳跃：5 号与 9 号是加速器
    const events = runChain(state)
    expect(events).toContain('fall7')  // 5 号加速器跳过 6 号沟
    expect(events).not.toContain('fall6')
    expect(events).toContain('fall11') // 9 号加速器跳过 10 号沟
    expect(events).not.toContain('fall10')
    expect(state.outcome).toBe('won')

    // 把加速器换成普通骨牌（同样库存不允许——直接构造对照状态）：
    // 普通骨牌无法跨越缺口，链断在 5 号。
    const plain = createGameState(3, 5)
    for (let x = 1; x <= 5; x += 1) placePiece(plain, x, 'domino')
    expect(runChain(plain)).toEqual(['fall1', 'fall2', 'fall3', 'fall4', 'fall5', 'break@5'])

    // 加速器 +2 处无牌时退回 +1 正常传导（跳不过去就按普通骨牌走）。
    const custom: Level = {
      name: '退回',
      w: 5,
      terrain: [1, 1, 1, 1, 2],
      pusherX: 0,
      bellX: 4,
      inventory: { domino: 2, bridge: 0, booster: 1 },
      solution: [],
    }
    const fallback = createGameState(0, 5)
    fallback.level = custom
    fallback.pieces.clear()
    fallback.used = { domino: 0, bridge: 0, booster: 0 }
    placePiece(fallback, 1, 'booster')
    placePiece(fallback, 2, 'domino')
    // +2（第 3 列）无牌：退回 +1 倒下第 2 列，随后第 3 列无牌断链。
    expect(runChain(fallback)).toEqual(['fall1', 'fall2', 'break@2'])

    // 铃铛判定：加速器 +2 直达两格外、高度差 1 的铃铛 = 过关。
    const jumpBell: Level = {
      name: '跳铃',
      w: 4,
      terrain: [2, 2, 2, 3],
      pusherX: 0,
      bellX: 3,
      inventory: { domino: 1, bridge: 0, booster: 1 },
      solution: [],
    }
    const jb = createGameState(0, 9)
    jb.level = jumpBell
    jb.pieces.clear()
    placePiece(jb, 1, 'booster')
    expect(runChain(jb)).toEqual(['fall1', 'win'])
    expect(jb.outcome).toBe('won')
  })

  it('高度差规则：相邻高度差 2 时链断', () => {
    const custom: Level = {
      name: '高差',
      w: 5,
      terrain: [1, 1, 3, 3, 4],
      pusherX: 0,
      bellX: 4,
      inventory: { domino: 3, bridge: 0, booster: 0 },
      solution: [],
    }
    const state = createGameState(0, 9)
    state.level = custom
    state.pieces.clear()
    placePiece(state, 1, 'domino')
    placePiece(state, 2, 'domino')
    placePiece(state, 3, 'domino')
    expect(runChain(state)).toEqual(['fall1', 'break@1'])
    expect(state.outcome).toBe('lost')
  })

  it('五个内置关卡的参考摆法全部可解', () => {
    for (let i = 0; i < LEVELS.length; i += 1) {
      const state = applySolution(i, 42 + i)
      const events = runChain(state)
      expect(state.outcome, 'level ' + i + ': ' + events.join(',')).toBe('won')
    }
  })

  it('宽壑关卡必须组合：两桥直铺（无加速器）必断', () => {
    // 只放桥 6、7 号（不用加速器）：从 5 号普通骨牌无法传导进 6 号沟。
    const state = createGameState(4, 11)
    for (let x = 1; x <= 5; x += 1) placePiece(state, x, 'domino')
    placePiece(state, 6, 'bridge')
    placePiece(state, 7, 'bridge')
    placePiece(state, 8, 'bridge') // 库存只有 2 —— 这一步应被拒
    expect(state.pieces.has(8)).toBe(false)
    const events = runChain(state)
    // 两块桥只能铺到 7 号：链传到 7 号后第 8 列仍是沟，断链。
    expect(events).toEqual([
      'fall1', 'fall2', 'fall3', 'fall4', 'fall5', 'fall6', 'fall7', 'break@7',
    ])
    expect(state.outcome).toBe('lost')
  })

  it('seed 确定性：mulberry32 与彩点配色同种子同序列、异种子不同', () => {
    const a1 = mulberry32(123)
    const a2 = mulberry32(123)
    const b = mulberry32(124)
    const seqA = [a1(), a1(), a1(), a1()]
    const seqA2 = [a2(), a2(), a2(), a2()]
    const seqB = [b(), b(), b(), b()]
    expect(seqA).toEqual(seqA2)
    expect(seqA).not.toEqual(seqB)
    const level = LEVELS[2]!
    expect(pipColors(level, 99)).toEqual(pipColors(level, 99))
    expect(pipColors(level, 99)).not.toEqual(pipColors(level, 100))
    expect(pipColors(level, 99).length).toBe(level.w)
  })

  it('终态与重摆：终态再步进为 idle，resetToBuild 后可重新摆放重推', () => {
    const state = applySolution(1, 8)
    runChain(state)
    expect(state.outcome).toBe('won')
    expect(stepChain(state)).toEqual({ kind: 'idle' })
    resetToBuild(state)
    expect(state.phase).toBe('build')
    expect(state.pieces.size).toBeGreaterThan(0)
    expect(placePiece(state, 1, 'domino')).toBe('该列已有件')
    expect(removePiece(state, 5)).toBe(true) // 拆掉桥板
    const events = runChain(state)
    expect(events.at(-1)).toBe('break@4') // 沟前断链
    expect(state.outcome).toBe('lost')
    resetToBuild(state)
    expect(placePiece(state, 5, 'bridge')).toBeNull() // 桥已回到库存，可重摆
    expect(runChain(state).at(-1)).toBe('win')
    expect(scoreFor(1, inventoryLeft(state))).toBeGreaterThan(100)
  })
})
