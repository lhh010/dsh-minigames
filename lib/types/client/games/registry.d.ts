/**
 * The game registry: the reserved interface for adding games. A future game
 * imports {@link registerGame} and contributes its definition at module load
 * (or the games index lists it); the panel reads through {@link getGames} /
 * {@link getGame} and never knows individual games.
 */
import type { MiniGameDefinition } from './types.ts';
/**
 * Register a game definition. Duplicate ids fail loud so a name collision
 * cannot silently shadow an existing game.
 * @param definition - the game to add.
 * @returns the same definition (for chaining in index files).
 */
export declare function registerGame(definition: MiniGameDefinition): MiniGameDefinition;
/**
 * All registered games, in registration order.
 * @returns a fresh snapshot array (callers may sort/filter freely).
 */
export declare function getGames(): MiniGameDefinition[];
/**
 * Look up one game by id.
 * @param id - the game id.
 * @returns the definition, or undefined when not registered.
 */
export declare function getGame(id: string): MiniGameDefinition | undefined;
