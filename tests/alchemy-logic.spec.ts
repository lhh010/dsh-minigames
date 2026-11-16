import { describe, expect, it } from 'vitest'
import {
  BASE_IDS,
  ELEMENTS,
  ELEMENT_BY_ID,
  MILESTONES,
  PAIR_RESULTS,
  RECIPES_FOR,
  combine,
  createInitialState,
  deserializeState,
  hintBudget,
  isComplete,
  milestoneLevel,
  mulberry32,
  pairKey,
  reachableFromBase,
  requestHint,
  scoreOf,
  serializeState,
  unreachableElements,
  type AlchemyState,
  type ElementCategory,
} from '../src/client/games/alchemy/logic.ts'

/** 按脚本把一局推进到 15 种发现（恰好第 1 段里程碑）。 */
function progressedState(hintSeed: number): AlchemyState {
  const state = createInitialState(hintSeed)
  const script: ReadonlyArray<readonly [string, string]> = [
    ['fire', 'water'],
    ['fire', 'earth'],
    ['fire', 'air'],
    ['earth', 'air'],
    ['earth', 'water'],
    ['water', 'water'],
    ['air', 'air'],
    ['earth', 'earth'],
    ['steam', 'air'],
    ['lava', 'water'],
    ['stone', 'wind'],
  ]
  for (const [a, b] of script) combine(state, a, b)
  return state
}

describe('alchemy element library', () => {
  it('内置 60+ 元素：四基本齐全，id/名称/图标全库唯一，类别合法', () => {
    expect(ELEMENTS.length).toBeGreaterThanOrEqual(60)
    const ids = new Set(ELEMENTS.map(el => el.id))
    expect(ids.size).toBe(ELEMENTS.length)
    const names = new Set(ELEMENTS.map(el => el.name))
    expect(names.size).toBe(ELEMENTS.length)
    const icons = new Set(ELEMENTS.map(el => el.icon))
    expect(icons.size).toBe(ELEMENTS.length)
    for (const base of BASE_IDS) expect(ids.has(base)).toBe(true)
    const categories: ReadonlySet<string> = new Set(['basic', 'nature', 'material', 'life', 'civ'])
    for (const el of ELEMENTS) expect(categories.has(el.category)).toBe(true)
  })

  it('配方表完整：原料/产物均为合法 id，且每个非基本元素都可从基本元素合成（BFS 可达）', () => {
    expect(unreachableElements()).toEqual([])
    for (const [key, results] of PAIR_RESULTS) {
      const [a = '', b = ''] = key.split('+')
      expect(ELEMENT_BY_ID.has(a)).toBe(true)
      expect(ELEMENT_BY_ID.has(b)).toBe(true)
      expect(results.length).toBeGreaterThan(0)
      for (const r of results) expect(ELEMENT_BY_ID.has(r)).toBe(true)
    }
    // 每个非基本元素都有至少一条配方，且产物不可能是基本元素。
    const reached = reachableFromBase()
    for (const el of ELEMENTS) {
      if (BASE_IDS.includes(el.id)) {
        expect(RECIPES_FOR.has(el.id)).toBe(false)
      } else {
        expect(RECIPES_FOR.has(el.id)).toBe(true)
        expect(reached.has(el.id)).toBe(true)
      }
    }
  })
})

describe('alchemy combine', () => {
  it('合成判定与原料顺序无关（无序对，双向同产）：火+水=汽=水+火', () => {
    const state = createInitialState(1)
    const forward = combine(state, 'fire', 'water')
    const backward = combine(createInitialState(1), 'water', 'fire')
    expect(forward).toEqual({ type: 'new', element: 'steam' })
    expect(backward).toEqual(forward)
    expect(state.discovered).toContain('steam')
  })

  it('同一对可产多物：岩浆+水 先产石再产汽，全部发现后判重复', () => {
    const state = createInitialState(2)
    expect(combine(state, 'fire', 'earth')).toEqual({ type: 'new', element: 'lava' })
    expect(combine(state, 'lava', 'water')).toEqual({ type: 'new', element: 'stone' })
    expect(combine(state, 'lava', 'water')).toEqual({ type: 'new', element: 'steam' })
    expect(combine(state, 'water', 'lava')).toEqual({ type: 'repeat', element: 'stone' })
  })

  it('重复检测：已发现的配方再合成返回 repeat 且不重复入库', () => {
    const state = createInitialState(3)
    combine(state, 'fire', 'water')
    const before = state.discovered.length
    expect(combine(state, 'water', 'fire')).toEqual({ type: 'repeat', element: 'steam' })
    expect(state.discovered.length).toBe(before)
  })

  it('无配方返回 none 且已试组合只记一次（键为排序后的无序对）', () => {
    const state = createInitialState(4)
    expect(combine(state, 'stone', 'bread')).toEqual({ type: 'none' })
    expect(combine(state, 'bread', 'stone')).toEqual({ type: 'none' })
    expect(state.tried).toEqual([pairKey('stone', 'bread')])
    expect(state.tried[0]).toBe('bread+stone')
  })
})

describe('alchemy milestones', () => {
  it('里程碑按 15/25/35/45/55 判定关卡与通关', () => {
    expect(MILESTONES).toEqual([15, 25, 35, 45, 55])
    expect(milestoneLevel(4)).toBe(0)
    expect(milestoneLevel(14)).toBe(0)
    expect(milestoneLevel(15)).toBe(1)
    expect(milestoneLevel(24)).toBe(1)
    expect(milestoneLevel(25)).toBe(2)
    expect(milestoneLevel(35)).toBe(3)
    expect(milestoneLevel(45)).toBe(4)
    expect(milestoneLevel(54)).toBe(4)
    expect(milestoneLevel(55)).toBe(5)
    expect(milestoneLevel(86)).toBe(5)
  })

  it('isComplete 只在第 5 段里程碑达成后为真；计分含里程碑奖励', () => {
    const state = progressedState(5)
    expect(state.discovered).toHaveLength(15)
    expect(isComplete(state)).toBe(false)
    expect(scoreOf(state)).toBe(15 * 10 + 100)
    expect(scoreOf(createInitialState(5))).toBe(4 * 10)
    // 推满 55 种发现 → 通关。
    const done = progressedState(6)
    for (const el of ELEMENTS) {
      if (done.discovered.length >= 55) break
      if (!done.discovered.includes(el.id)) done.discovered.push(el.id)
    }
    expect(done.discovered.length).toBe(55)
    expect(milestoneLevel(done.discovered.length)).toBe(5)
    expect(isComplete(done)).toBe(true)
    expect(scoreOf(done)).toBe(55 * 10 + 500)
  })
})

describe('alchemy hints', () => {
  it('配额由里程碑解锁：开局无提示，达成后消耗递减', () => {
    const fresh = createInitialState(7)
    expect(hintBudget(fresh)).toBe(0)
    expect(requestHint(fresh)).toEqual({ type: 'exhausted' })
    const state = progressedState(7)
    expect(hintBudget(state)).toBe(1)
    const result = requestHint(state)
    expect(result.type).toBe('hint')
    expect(hintBudget(state)).toBe(0)
    expect(requestHint(state)).toEqual({ type: 'exhausted' })
  })

  it('提示选取确定性：同种子同状态序列完全一致，且揭示的原料确属该元素配方', () => {
    const a = progressedState(42)
    const b = progressedState(42)
    const resultA = requestHint(a)
    const resultB = requestHint(b)
    expect(resultA).toEqual(resultB)
    if (resultA.type !== 'hint') throw new Error('expected a hint')
    const recipes = RECIPES_FOR.get(resultA.element) ?? []
    const inSomeRecipe = recipes.some(pair => pair.includes(resultA.ingredient))
    expect(inSomeRecipe).toBe(true)
    expect(a.hints[resultA.element]).toBe(resultA.ingredient)
    // 已提示元素不再入选（记录在案，防重复消耗）。
    expect(Object.keys(a.hints)).toHaveLength(1)
  })

  it('提示顺序受种子影响：不同种子覆盖到不同目标元素', () => {
    const picks = new Set<string>()
    for (let seed = 1; seed <= 30; seed += 1) {
      const result = requestHint(progressedState(seed))
      expect(result.type).toBe('hint')
      if (result.type === 'hint') picks.add(result.element + ':' + result.ingredient)
    }
    expect(picks.size).toBeGreaterThan(1)
  })
})

describe('alchemy serialization', () => {
  it('状态序列化严格往返；未知 id / 坏 JSON / 版本不符均拒绝', () => {
    const state = progressedState(9)
    requestHint(state)
    state.tried.push(pairKey('gold', 'rain'))
    const round = deserializeState(serializeState(state))
    expect(round).not.toBeNull()
    expect(round).toEqual(state)
    expect(deserializeState('{oops')).toBeNull()
    expect(deserializeState('null')).toBeNull()
    const badId = serializeState(state).replace('"steam"', '"nonsense"')
    expect(deserializeState(badId)).toBeNull()
    const badVersion = serializeState(state).replace('alchemy1', 'alchemy0')
    expect(deserializeState(badVersion)).toBeNull()
  })
})

describe('alchemy mulberry32', () => {
  it('mulberry32 同种子同序列、异种子异序列（提示系统的确定性来源）', () => {
    const a = mulberry32(123)
    const b = mulberry32(123)
    const c = mulberry32(124)
    const seqA = [a(), a(), a(), a()]
    const seqB = [b(), b(), b(), b()]
    expect(seqA).toEqual(seqB)
    const seqC = [c(), c(), c(), c()]
    expect(seqA).not.toEqual(seqC)
  })
})