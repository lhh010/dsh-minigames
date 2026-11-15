/**
 * 星之战 game definition: wires the pure starbattle logic into a
 * MiniGameInstance — click cycles a cell 空→星→✗ (right-click marks ✗
 * directly), conflicts (over-cap line/region or touching stars) glow red as
 * instant feedback without blocking input, and when every row/column/region
 * holds exactly k pairwise-non-adjacent stars the level is won: onScore fires
 * with the time bonus and the game auto-advances 1.5s later. H plants one
 * correct star (3 per level), R restarts the same puzzle, P pauses (timer
 * freezes via the stored-remainder pattern). Persisted level resumes after a
 * refresh. Render loop is dirty-mode: repaints only on change plus star-pop
 * animation frames.
 */
import type { MiniGameDefinition } from '../types.ts';
/** 星之战 Star Battle：每行每列每区恰 k 颗互不邻接的星。 */
export declare const starbattleGame: MiniGameDefinition;
