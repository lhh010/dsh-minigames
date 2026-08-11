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

  it('registers the eighteen built-in games', () => {
    registerBuiltinGames()
    const ids = getGames().map(game => game.id)
    for (const id of ['dino', 'tanks', 'tetris', 'match3', 'huarong', 'snake', '2048', 'minesweeper', 'memory', 'gomoku', 'hop', 'breakout', 'whack', 'othello', 'flappy', 'sudoku', 'pacman', 'aimtrack']) {
      expect(ids).toContain(id)
    }
    expect(ids).not.toContain('pong')
  })

  it('getGame returns the registered definition', () => {
    expect(getGame('dino')?.title).toBe('恐龙跳一跳')
    expect(getGame('tanks')?.title).toBe('坦克大战')
    expect(getGame('tetris')?.title).toBe('俄罗斯方块')
    expect(getGame('match3')?.title).toBe('消消乐')
    expect(getGame('huarong')?.title).toBe('华容道')
    expect(getGame('snake')?.title).toBe('贪吃蛇')
    expect(getGame('2048')?.title).toBe('2048')
    expect(getGame('minesweeper')?.title).toBe('扫雷')
    expect(getGame('memory')?.title).toBe('记忆翻牌')
    expect(getGame('gomoku')?.title).toBe('五子棋')
    expect(getGame('hop')?.title).toBe('跳一跳')
    expect(getGame('breakout')?.title).toBe('打砖块')
    expect(getGame('whack')?.title).toBe('打地鼠')
    expect(getGame('othello')?.title).toBe('黑白棋')
    expect(getGame('flappy')?.title).toBe('Flappy')
    expect(getGame('sudoku')?.title).toBe('数独')
    expect(getGame('pacman')?.title).toBe('吃豆人')
    expect(getGame('aimtrack')?.title).toBe('跟枪练习')
  })
})
