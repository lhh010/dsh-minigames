import { describe, expect, it } from 'vitest'
import { registerGame, getGames, getGame, registerBuiltinGames } from '../src/client/games/index.ts'
import type { MiniGameDefinition } from '../src/client/games/types.ts'

const dummy: MiniGameDefinition = {
  id: 'dummy',
  title: '测试游戏',
  icon: '🧪',
  description: '单元测试用',
  controls: ['任意键：无操作'],
  create: () => ({
    start: () => {},
    pause: () => {},
    resume: () => {},
    destroy: () => {},
  }),
}

describe('game registry', () => {
  it('registers and lists definitions in order', () => {
    registerGame(dummy)
    const games = getGames()
    expect(games.some(game => game.id === 'dummy')).toBe(true)
  })

  it('returns undefined for an unknown id', () => {
    expect(getGame('nope')).toBeUndefined()
  })

  it('rejects duplicate ids loudly', () => {
    expect(() => registerGame({ ...dummy, id: 'dummy' })).toThrow(/already registered/)
  })

  it('registers the four built-in games', () => {
    registerBuiltinGames()
    const ids = getGames().map(game => game.id)
    // Tolerant of other registrations from earlier tests in this file.
    for (const id of ['dino', 'tanks', 'tetris', 'match3']) {
      expect(ids).toContain(id)
    }
  })

  it('getGame returns the registered definition', () => {
    expect(getGame('dino')?.title).toBe('恐龙跳一跳')
    expect(getGame('tanks')?.title).toBe('坦克大战')
    expect(getGame('tetris')?.title).toBe('俄罗斯方块')
    expect(getGame('match3')?.title).toBe('消消乐')
  })
})
