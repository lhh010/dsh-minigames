import { describe, expect, it } from 'vitest'
import {
  type Dir, type RoboLevelSpec, type Token,
  executeProgram, expandProgram, getLevels, parseLevel, runProgram, validateProgram,
} from '../src/client/games/robocode/logic.ts'

/** 造一张自定义关卡网格（默认 32 步预算、16 槽位）。 */
function makeLevel(grid: string[], startDir: Dir, extra?: Partial<RoboLevelSpec>) {
  return parseLevel({
    id: 99, name: '测试关', grid, startDir, maxSlots: 16, budget: 32,
    reference: [], ...extra,
  })
}

describe('robocode logic', () => {
  it('F/L/R 语义：前进位移与左右转朝向正确', () => {
    const level = makeLevel([
      '#####',
      '#R..#',
      '#...#',
      '#C.G#',
      '#####',
    ], 1)
    const result = executeProgram(level, ['F', 'R', 'F', 'L', 'F'])
    expect(result.status).toBe('incomplete')
    expect(result.x).toBe(3)
    expect(result.y).toBe(2)
    expect(result.dir).toBe(1)
    expect(result.steps.map((s) => s.event)).toEqual(['move', 'turn', 'move', 'turn', 'move'])
  })

  it('F2 双格前进：拆成两步逐格执行并拾取途中芯片', () => {
    const level = makeLevel([
      '#######',
      '#R.C.G#',
      '#######',
    ], 1)
    const result = executeProgram(level, ['F2'])
    expect(result.x).toBe(3)
    expect(result.y).toBe(1)
    expect(result.chipsLeft).toBe(0)
    expect(result.steps.length).toBe(2)
    expect(result.steps[0]!.event).toBe('move')
    expect(result.steps[1]!.event).toBe('pick')
  })

  it('J 跳跃：越过尖刺/坑安全，落点尖刺或墙则中断，越过芯片不拾取', () => {
    const spike = executeProgram(makeLevel([
      '########',
      '#R^.C.G#',
      '########',
    ], 1), ['J', 'F', 'F', 'F'])
    expect(spike.status).toBe('won')
    expect(spike.steps[0]!.event).toBe('jump')

    const pit = executeProgram(makeLevel([
      '########',
      '#RO.C.G#',
      '########',
    ], 1), ['J', 'F', 'F', 'F'])
    expect(pit.status).toBe('won')
    expect(pit.steps[0]!.event).toBe('jump')
    expect(pit.steps[1]!.event).toBe('pick')

    const landSpike = executeProgram(makeLevel([
      '#######',
      '#RC^.G#',
      '#######',
    ], 1), ['J'])
    expect(landSpike.status).toBe('crashed')
    expect(landSpike.steps[landSpike.steps.length - 1]!.event).toBe('spike')

    const landWall = executeProgram(makeLevel([
      '#######',
      '#RC##G#',
      '#######',
    ], 1), ['J'])
    expect(landWall.status).toBe('crashed')
    expect(landWall.steps[landWall.steps.length - 1]!.event).toBe('blocked')

    const skip = executeProgram(makeLevel([
      '######',
      '#RC.G#',
      '######',
    ], 1), ['J'])
    expect(skip.status).toBe('incomplete')
    expect(skip.steps[0]!.event).toBe('jump')
    expect(skip.chipsLeft).toBe(1)
  })

  it('撞墙与踩尖刺即中断，轨迹终止于中断步', () => {
    const wall = executeProgram(makeLevel([
      '#######',
      '#RC#^G#',
      '#######',
    ], 1), ['F', 'F'])
    expect(wall.status).toBe('crashed')
    expect(wall.steps.length).toBe(2)
    expect(wall.steps[1]!.event).toBe('blocked')
    const spike = executeProgram(makeLevel([
      '########',
      '#R.C.^G#',
      '########',
    ], 1), ['F', 'F', 'F', 'F', 'F'])
    expect(spike.status).toBe('crashed')
    expect(spike.steps[spike.steps.length - 1]!.event).toBe('spike')
  })

  it('终点闸门：芯片未收齐时视为墙（中断），收齐后进入即过关', () => {
    const level = makeLevel([
      '#######',
      '#R.C.G#',
      '#######',
    ], 1)
    const blocked = executeProgram(makeLevel([
      '########',
      '#RC...G#',
      '########',
    ], 1), ['J', 'J', 'F'])
    expect(blocked.status).toBe('crashed')
    expect(blocked.steps[blocked.steps.length - 1]!.event).toBe('blocked')
    const won = executeProgram(makeLevel([
      '#######',
      '#R.C.G#',
      '#######',
    ], 1), ['F', 'F', 'F', 'F'])
    expect(won.status).toBe('won')
    expect(won.steps[won.steps.length - 1]!.event).toBe('win')
    expect(won.chipsLeft).toBe(0)
  })

  it('循环展开：嵌套两层按重复次数正确展开，且记录来源槽位', () => {
    const tokens: Token[] = [{ loop: 2 }, 'F', { loop: 2 }, 'L', 'end', 'R', 'end']
    const expanded = expandProgram(tokens)
    expect(expanded).not.toBeNull()
    expect(expanded!.ops).toEqual(['F', 'L', 'L', 'R', 'F', 'L', 'L', 'R'])
    expect(expanded!.opToken).toEqual([1, 3, 3, 5, 1, 3, 3, 5])
  })

  it('程序校验拒绝：未闭合 / 多余 end / 嵌套超 2 层 / 循环次数越界 / 槽位超限 / 展开超预算', () => {
    const level = makeLevel(['#######', '#R.C.G#', '#######'], 1)
    expect(validateProgram(level, [{ loop: 2 }, 'F'])).toMatch(/未闭合/)
    expect(validateProgram(level, ['end'])).toMatch(/多余/)
    expect(validateProgram(level, [{ loop: 1 }, { loop: 1 }, { loop: 1 }, 'F', 'end', 'end', 'end'])).toMatch(/嵌套/)
    expect(validateProgram(level, [{ loop: 9 }, 'F', 'end'])).toMatch(/循环次数/)
    expect(validateProgram(level, Array.from({ length: 17 }, () => 'F' as Token))).toMatch(/槽位/)
    expect(validateProgram(level, [{ loop: 8 }, { loop: 8 }, 'F', 'end', 'end'])).toMatch(/预算/)
    expect(validateProgram(level, ['F', 'F', 'F', 'F'])).toBeNull()
  })

  it('全部 10 关的参考程序均可过关', () => {
    const levels = getLevels()
    expect(levels.length).toBe(10)
    for (const level of levels) {
      const run = runProgram(level, level.reference)
      expect(run.error, '关卡 ' + level.id + ' 参考程序校验失败').toBeNull()
      expect(run.result!.status, '关卡 ' + level.id + ' 参考程序未过关').toBe('won')
      expect(run.result!.chipsLeft).toBe(0)
    }
  })

  it('关卡约束逼出循环与嵌套：平铺 / 单层循环解因槽位被拒', () => {
    const levels = getLevels()
    const loopLevel = levels[2]!
    expect(validateProgram(loopLevel, Array.from({ length: 8 }, () => 'F' as Token))).toMatch(/槽位/)
    expect(validateProgram(loopLevel, loopLevel.reference)).toBeNull()
    const nestedLevel = levels[3]!
    const single: Token[] = [{ loop: 3 }, 'F', 'F', 'F', 'F', 'R', 'end']
    expect(validateProgram(nestedLevel, single)).toMatch(/槽位/)
    expect(validateProgram(nestedLevel, nestedLevel.reference)).toBeNull()
    const ringLevel = levels[6]!
    const unnested: Token[] = [
      { loop: 5 }, 'F', 'end', 'R',
      { loop: 5 }, 'F', 'end', 'R',
      { loop: 5 }, 'F', 'end', 'R',
      { loop: 5 }, 'F', 'end', 'R',
    ]
    expect(validateProgram(ringLevel, unnested)).toMatch(/槽位/)
    expect(validateProgram(ringLevel, ringLevel.reference)).toBeNull()
  })

  it('确定性重放：同一关卡同一程序两次执行轨迹逐字段一致', () => {
    const level = getLevels()[4]!
    const a = runProgram(level, level.reference)
    const b = runProgram(level, [...level.reference])
    expect(b.result!.steps).toEqual(a.result!.steps)
    expect(b.result!.status).toBe(a.result!.status)
    expect(b.result!.reason).toBe(a.result!.reason)
    expect(b.opToken).toEqual(a.opToken)
  })

  it('预算与未完成：步数预算耗尽受保护，提前停止报 incomplete', () => {
    const level = makeLevel(['#######', '#R.C.G#', '#######'], 1, { budget: 3 })
    const over = runProgram(level, [{ loop: 4 }, 'F', 'end'])
    expect(over.error).toMatch(/预算/)
    const tight = makeLevel(['#########', '#R.C...G#', '#########'], 1, { budget: 5 })
    const budgetRun = executeProgram(tight, ['F', 'F', 'F', 'F', 'F', 'F'])
    expect(budgetRun.status).toBe('crashed')
    expect(budgetRun.steps[budgetRun.steps.length - 1]!.event).toBe('budget')
    const short = executeProgram(level, ['F'])
    expect(short.status).toBe('incomplete')
    expect(short.chipsLeft).toBe(1)
  })
})
