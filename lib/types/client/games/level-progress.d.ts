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
/** Minimal storage contract (localStorage satisfies it). */
export interface LevelStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}
/** Highest level reached for `gameId` (1 when nothing is stored). */
export declare function readLevel(gameId: string, storage?: LevelStorage | null): number;
/** Persist `level` when it exceeds the stored value (progress never regresses). */
export declare function saveLevel(gameId: string, level: number, storage?: LevelStorage | null): void;
/** Reset the stored progress for `gameId` back to level 1. */
export declare function clearLevel(gameId: string, storage?: LevelStorage | null): void;
