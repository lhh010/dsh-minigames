/**
 * 分子构建逻辑测试：解析校验、化合价/成键规则、推动（单原子/成团/撞墙）、
 * 过关判定、撤销、死锁、seed 确定性，以及全部手工关卡的 BFS 可解性与
 * PAR 最优步数互校验。
 */
import { describe, expect, it } from 'vitest'
import {
  BOND_SCORE, CLEAR_SCORE, LEVELS, MAX_BOND_ORDER, PAR, VALENCE,
  applyMove, countsOf, createMoleculeState, createMoleculeStateFromDef,
  formatFormula, freeBonds, isDeadlocked, isConnected, mulberry32,
  parseLevel, restartLevel, shimmerOrder, solve, stateKey, structureString,
  undoMove, type MoleculeLevelDef, type MoleculeState,
} from '../src/client/games/molecule/logic.ts'

describe('molecule logic', () => {
  it('十关解析合法：唯一主原子、元素计数与分子式一致、初始无相邻原子', () => {
    expect(LEVELS).toHaveLength(10)
    const formulas = LEVELS.map(l => l.formula)
    expect(formulas).toEqual(['H2O', 'CO2', 'H3N', 'CH4', 'C2H4', 'O2', 'H2O2', 'CH2O', 'CH4O', 'CH2O2'])
    for (const def of LEVELS) {
      const parsed = parseLevel(def)
      expect(parsed.atoms.filter(a => a.el === def.mainEl).length).toBeGreaterThanOrEqual(1)
      expect(parsed.mainId).toBeGreaterThanOrEqual(0)
      expect(formatFormula(countsOf(parsed.atoms))).toBe(def.formula)
    }
  })

  it('解析拒绝非法盘面：双主原子、未知字符、初始相邻原子、计数不符', () => {
    const bad: MoleculeLevelDef[] = [
      { name: 'x', formula: 'H2', display: 'H₂', hint: '', mainEl: 'H', grid: ['#####', '#@H@#', '#####'] },
      { name: 'x', formula: 'H2', display: 'H₂', hint: '', mainEl: 'H', grid: ['#####', '#@X #', '#####'] },
      { name: 'x', formula: 'H2O', display: 'H₂O', hint: '', mainEl: 'O', grid: ['#####', '#@H #', '#####'] },
      { name: 'x', formula: 'H2', display: 'H₂', hint: '', mainEl: 'H', grid: ['#####', '#@O #', '#####'] },
      { name: 'x', formula: 'H2', display: 'H₂', hint: '', mainEl: 'H', grid: ['####'] },
    ]
    for (const def of bad) expect(() => parseLevel(def)).toThrow()
  })

  it('化合价正确；单键消耗双方价、双键按较小空价且不超过上限 2', () => {
    expect(VALENCE).toEqual({ H: 1, O: 2, N: 3, C: 4 })
    expect(MAX_BOND_ORDER).toBe(2)
    // 水关：主 O 右移一步与 H 相邻成单键，O 空价 2->1，H 0。
    const s = createMoleculeState(0)
    const move = applyMove(s, 'right')!
    expect(move.formed).toEqual([{ a: 0, b: 1, order: 1 }])
    const main = s.atoms[0]!
    const h = s.atoms[1]!
    expect(freeBonds(main)).toBe(1)
    expect(freeBonds(h)).toBe(0)
    expect(s.score).toBe(BOND_SCORE)
    // 二氧化碳关：C 与 O 相邻成双键（min(2,4,2)），C 剩 2、O 剩 0。
    const c = createMoleculeState(1)
    applyMove(c, 'down')
    applyMove(c, 'down')
    const cMain = c.atoms[0]!
    expect(cMain.bonds).toEqual({ 1: 2 })
    expect(freeBonds(cMain)).toBe(2)
    expect(freeBonds(c.atoms[1]!)).toBe(0)
  })

  it('撞墙不动；被推原子撞墙整步拒绝且计步不变', () => {
    const s = createMoleculeStateFromDef({
      name: 'x', formula: 'H', display: 'H', hint: '', mainEl: 'H',
      grid: ['#####', '#@  #', '#####'],
    })
    expect(applyMove(s, 'up')).toBeNull() // 主原子上方是墙
    expect(applyMove(s, 'left')).toBeNull() // 左侧也是墙
    expect(s.moves).toBe(0)
    const push = createMoleculeStateFromDef({
      name: 'x', formula: 'H2', display: 'H₂', hint: '', mainEl: 'H',
      grid: ['#####', '#@ H#', '#####'],
    })
    expect(applyMove(push, 'right')).not.toBeNull() // H 被推到 (1,3) 并与主 H 成键
    expect(push.moves).toBe(1)
    expect(applyMove(push, 'right')).toBeNull() // H 的目的地 (1,4) 是墙
    expect(push.moves).toBe(1)
  })

  it('已成键原子团刚性移动；主原子团可推动另一个已成键团', () => {
    // 主 O 先与 H 成键（H 饱和成为前导），再把自由 O2 顶到 O3 旁让二者
    // 成双键，最后用主原子团把这个 O2=O3 团整体再推一格。
    const s = createMoleculeStateFromDef({
      name: 'x', formula: 'HO3', display: 'HO₃', hint: '', mainEl: 'O',
      grid: ['###########', '#         #', '# @ H O O #', '#         #', '###########'],
    })
    applyMove(s, 'right') // 主 O 到 (2,3)
    applyMove(s, 'right') // 推 H 到 (2,5)，主 O 与 H 成键（H 饱和）
    expect(s.atoms[0]!.c).toBe(4)
    expect(s.atoms[1]!.c).toBe(5)
    const push = applyMove(s, 'right')! // 前导 H 把 O2 推到 (2,7)，与 O3 成双键
    expect(push.formed).toEqual([{ a: 2, b: 3, order: 2 }])
    expect(freeBonds(s.atoms[2]!)).toBe(0)
    const pushGroup = applyMove(s, 'right')! // 主原子团推动整个 O2=O3 团
    expect(pushGroup.moved.map(m => m.id)).toEqual([0, 1, 2, 3])
    expect([s.atoms[0]!.c, s.atoms[1]!.c, s.atoms[2]!.c, s.atoms[3]!.c]).toEqual([6, 7, 8, 9])
    expect(s.atoms[3]!.c - s.atoms[2]!.c).toBe(1) // 被推团保持刚性
  })

  it('过关判定：连通 + 全部价饱和 + 目标式；未连满不成团不过关', () => {
    const s = createMoleculeState(0)
    applyMove(s, 'right')
    expect(isConnected(s)).toBe(false)
    expect(s.cleared).toBe(false)
    applyMove(s, 'down')
    applyMove(s, 'down')
    expect(isConnected(s)).toBe(true)
    for (const a of s.atoms) expect(freeBonds(a)).toBe(0)
    expect(s.cleared).toBe(true)
    expect(s.score).toBe(2 * BOND_SCORE + CLEAR_SCORE)
    expect(structureString(s)).toBe('O–H–H')
    // CO2 双键过关：O=C=O
    const c = createMoleculeState(1)
    for (const dir of ['down', 'down', 'down'] as const) applyMove(c, dir)
    expect(c.cleared).toBe(true)
    expect(structureString(c)).toBe('C=O=O')
  })

  it('撤销完整恢复布局、键、步数与分数；空历史返回 false', () => {
    const s = createMoleculeState(0)
    expect(undoMove(s)).toBe(false)
    applyMove(s, 'right')
    applyMove(s, 'down')
    const key = stateKey(s)
    const before = JSON.stringify({ m: s.moves, sc: s.score })
    applyMove(s, 'down')
    expect(s.cleared).toBe(true)
    expect(undoMove(s)).toBe(true)
    expect(stateKey(s)).toBe(key)
    expect(JSON.stringify({ m: s.moves, sc: s.score })).toBe(before)
    expect(s.cleared).toBe(false)
    expect(undoMove(s)).toBe(true)
    expect(undoMove(s)).toBe(true)
    expect(s.moves).toBe(0)
  })

  it('重开回滚入关分数与初始布局', () => {
    const s = createMoleculeState(2)
    applyMove(s, 'up')
    applyMove(s, 'left')
    restartLevel(s)
    expect(s.moves).toBe(0)
    expect(s.score).toBe(0)
    expect(s.cleared).toBe(false)
    expect(s.atoms.map(a => a.r + ',' + a.c)).toEqual(parseLevel(LEVELS[2]!).atoms.map(a => a.r + ',' + a.c))
  })

  it('死锁检测：空价超过剩余可成键上界（死胡同 C）与全墙困死', () => {
    // C(价 4) 被推进仅一格开口的死胡同：上/右/下皆墙，只剩已键合的 H，
    // 未来上界 0 < 空价 3。
    const s = createMoleculeStateFromDef({
      name: 'x', formula: 'CH', display: 'CH', hint: '', mainEl: 'H',
      grid: ['#########', '#@   C  #', '#########', '#       #', '#########'],
    })
    expect(isDeadlocked(s)).toBe(false)
    for (let i = 0; i < 5; i += 1) applyMove(s, 'right')
    expect(isDeadlocked(s)).toBe(true)
    // 被完全封死、带空价的原子从加载起即死锁。
    const buried = createMoleculeStateFromDef({
      name: 'x', formula: 'HO', display: 'HO', hint: '', mainEl: 'H',
      grid: ['#######', '#O# @##', '#######', '#######', '#######'],
    })
    expect(isDeadlocked(buried)).toBe(true)
    // 主原子四方向全墙：无路可走也是死锁。
    const stuck = createMoleculeStateFromDef({
      name: 'x', formula: 'H', display: 'H', hint: '', mainEl: 'H',
      grid: ['#####', '##@##', '#####'],
    })
    expect(isDeadlocked(stuck)).toBe(true)
    expect(formatFormula(countsOf(stuck.atoms))).toBe('H')
  })

  it('seed 确定性：mulberry32 可重放；逻辑与 seed 无关；shimmerOrder 同 seed 同序', () => {
    const r1 = mulberry32(42)
    const r2 = mulberry32(42)
    const seq1 = [r1(), r1(), r1()]
    const seq2 = [r2(), r2(), r2()]
    expect(seq1).toEqual(seq2)
    const moves = ('right,down,down,up,left').split(',') as ('right' | 'down' | 'up' | 'left')[]
    const play = (seed: number): string => {
      const s = createMoleculeState(0, seed)
      for (const dir of moves) applyMove(s, dir)
      return stateKey(s)
    }
    expect(play(42)).toBe(play(42))
    expect(play(42)).toBe(play(7)) // 逻辑结果与 seed 无关
    const s42a = createMoleculeState(4, 42)
    const s42b = createMoleculeState(4, 42)
    expect(shimmerOrder(s42a)).toEqual(shimmerOrder(s42b))
    expect(shimmerOrder(createMoleculeState(4, 42)).slice().sort()).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('十关均在预算内可解，且 PAR 等于 BFS 最优步数', { timeout: 120_000 }, () => {
    for (let i = 0; i < LEVELS.length; i += 1) {
      const s = createMoleculeState(i)
      const best = solve(s, 400_000)
      console.log('level', i + 1, 'optimal', best)
      expect(best, 'level ' + (i + 1) + ' solvable').toBeGreaterThan(0)
      expect(best, 'level ' + (i + 1) + ' par').toBe(PAR[i]!)
    }
  })
})
