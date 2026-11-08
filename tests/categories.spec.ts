import { describe, expect, it } from 'vitest'
import { getGames, registerBuiltinGames } from '../src/client/games/index.ts'
import { CATEGORIES, categoryOf } from '../src/client/panel/categories.ts'

registerBuiltinGames()
const GAMES = getGames()

describe('game categories', () => {
  it('every registered game maps to a known category', () => {
    const ids = new Set(CATEGORIES.map(c => c.id))
    for (const game of GAMES) {
      expect(ids.has(categoryOf(game.id)), game.id + ' -> ' + categoryOf(game.id)).toBe(true)
    }
  })
  it('category counts add up to the registry total', () => {
    const perCat = CATEGORIES.map(c => GAMES.filter(g => categoryOf(g.id) === c.id).length)
    const sum = perCat.reduce((a, b) => a + b, 0)
    expect(sum).toBe(GAMES.length)
  })
  it('no category is empty', () => {
    for (const c of CATEGORIES) {
      expect(GAMES.some(g => categoryOf(g.id) === c.id), c.id).toBe(true)
    }
  })
})
