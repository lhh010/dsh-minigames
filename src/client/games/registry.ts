/**
 * The game registry: the reserved interface for adding games. A future game
 * imports {@link registerGame} and contributes its definition at module load
 * (or the games index lists it); the panel reads through {@link getGames} /
 * {@link getGame} and never knows individual games.
 */
import type { MiniGameDefinition } from './types.ts'

const games = new Map<string, MiniGameDefinition>()

/**
 * Register a game definition. Duplicate ids fail loud so a name collision
 * cannot silently shadow an existing game.
 * @param definition - the game to add.
 * @returns the same definition (for chaining in index files).
 */
export function registerGame(definition: MiniGameDefinition): MiniGameDefinition {
  if (games.has(definition.id)) {
    throw new Error(`dsh-minigames: game "${definition.id}" is already registered`)
  }
  games.set(definition.id, definition)
  return definition
}

/**
 * All registered games, in registration order.
 * @returns a fresh snapshot array (callers may sort/filter freely).
 */
export function getGames(): MiniGameDefinition[] {
  return [...games.values()]
}

/**
 * Look up one game by id.
 * @param id - the game id.
 * @returns the definition, or undefined when not registered.
 */
export function getGame(id: string): MiniGameDefinition | undefined {
  return games.get(id)
}
