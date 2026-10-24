import { describe, expect, it } from 'vitest'
import { readLevel, saveLevel, clearLevel, type LevelStorage } from '../src/client/games/level-progress.ts'

/** In-memory storage stub. */
function memStorage(seed: Record<string, string> = {}): LevelStorage & { dump: Record<string, string> } {
  const dump: Record<string, string> = { ...seed }
  return {
    dump,
    getItem: (k) => dump[k] ?? null,
    setItem: (k, v) => { dump[k] = v },
    removeItem: (k) => { delete dump[k] },
  }
}

describe('level-progress', () => {
  it('defaults to level 1 with nothing stored', () => {
    expect(readLevel('maze', memStorage())).toBe(1)
  })

  it('round-trips a saved level', () => {
    const s = memStorage()
    saveLevel('maze', 4, s)
    expect(readLevel('maze', s)).toBe(4)
  })

  it('never regresses on a lower save', () => {
    const s = memStorage()
    saveLevel('maze', 5, s)
    saveLevel('maze', 2, s)
    expect(readLevel('maze', s)).toBe(5)
  })

  it('scopes by game id', () => {
    const s = memStorage()
    saveLevel('maze', 3, s)
    saveLevel('hashi', 7, s)
    expect(readLevel('maze', s)).toBe(3)
    expect(readLevel('hashi', s)).toBe(7)
  })

  it('uses the documented key prefix', () => {
    const s = memStorage()
    saveLevel('maze', 2, s)
    expect(Object.keys(s.dump)).toEqual(['dsh-minigames:level:maze'])
  })

  it('clearLevel resets to the default', () => {
    const s = memStorage()
    saveLevel('maze', 9, s)
    clearLevel('maze', s)
    expect(readLevel('maze', s)).toBe(1)
  })

  it('ignores corrupt stored values', () => {
    expect(readLevel('maze', memStorage({ 'dsh-minigames:level:maze': 'not-a-number' }))).toBe(1)
    expect(readLevel('maze', memStorage({ 'dsh-minigames:level:maze': '-3' }))).toBe(1)
    expect(readLevel('maze', memStorage({ 'dsh-minigames:level:maze': '2.7' }))).toBe(2)
  })

  it('survives a storage that throws', () => {
    const hostile: LevelStorage = {
      getItem() { throw new Error('denied') },
      setItem() { throw new Error('denied') },
      removeItem() { throw new Error('denied') },
    }
    expect(readLevel('maze', hostile)).toBe(1)
    expect(() => saveLevel('maze', 3, hostile)).not.toThrow()
    expect(() => clearLevel('maze', hostile)).not.toThrow()
  })
})
