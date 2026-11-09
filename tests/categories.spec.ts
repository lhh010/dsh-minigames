import { describe, expect, it } from 'vitest'
import { getGames, registerBuiltinGames } from '../src/client/games/index.ts'
import {
  CATEGORIES, categoryOf, classicIds, isCategorized, isClassic,
} from '../src/client/panel/categories.ts'

registerBuiltinGames()
const GAMES = getGames()

describe('game categories', () => {
  it('every registered game maps to a known category', () => {
    const ids = new Set(CATEGORIES.map(c => c.id))
    for (const game of GAMES) {
      expect(ids.has(categoryOf(game.id)), game.id + ' -> ' + categoryOf(game.id)).toBe(true)
    }
  })
  it('every registered game has an explicit category entry (no silent casual fallback)', () => {
    const missing = GAMES.map(g => g.id).filter(id => !isCategorized(id))
    expect(missing).toEqual([])
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

describe('classic tag', () => {
  it('every curated classic id exists in the registry and the set is non-trivial', () => {
    const ids = new Set(GAMES.map(g => g.id))
    const declared = classicIds()
    expect(declared.length).toBeGreaterThanOrEqual(15)
    // A typo in the curated list silently drops the game from the ⭐ page; assert the
    // list itself, not only the games that happen to match it.
    for (const id of declared) expect(ids.has(id), id).toBe(true)
    expect(GAMES.filter(g => isClassic(g.id))).toHaveLength(declared.length)
  })
})
