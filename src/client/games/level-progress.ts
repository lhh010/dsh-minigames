/**
 * Shared level-progress persistence for the games panel: the highest level
 * reached per game id, stored under `dsh-minigames:level:<gameId>` in
 * localStorage. Games read it at mount (start where the player left off)
 * and write it whenever they advance. A page refresh or game switch keeps
 * the progress; the stored value is a plain integer ≥ 1.
 *
 * The storage backend is injectable so the logic is unit-testable without a
 * DOM (production callers pass nothing and get the browser's localStorage).
 */

const PREFIX = 'dsh-minigames:level:'

/** Minimal storage contract (localStorage satisfies it). */
export interface LevelStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

function defaultStorage(): LevelStorage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage !== undefined) return window.localStorage
  } catch { /* storage unavailable */ }
  return null
}

/** Highest level reached for `gameId` (1 when nothing is stored). */
export function readLevel(gameId: string, storage: LevelStorage | null = defaultStorage()): number {
  try {
    const saved = storage?.getItem(PREFIX + gameId) ?? null
    if (saved !== null) {
      const n = Number(saved)
      if (Number.isFinite(n) && n >= 1) return Math.floor(n)
    }
  } catch { /* storage unavailable */ }
  return 1
}

/** Persist `level` when it exceeds the stored value (progress never regresses). */
export function saveLevel(gameId: string, level: number, storage: LevelStorage | null = defaultStorage()): void {
  if (level <= readLevel(gameId, storage)) return
  try { storage?.setItem(PREFIX + gameId, String(Math.floor(level))) } catch { /* storage unavailable */ }
}

/** Reset the stored progress for `gameId` back to level 1. */
export function clearLevel(gameId: string, storage: LevelStorage | null = defaultStorage()): void {
  try { storage?.removeItem(PREFIX + gameId) } catch { /* storage unavailable */ }
}
