/**
 * Built-in game collection: the single registration point for the games that
 * ship with the plugin. Adding a game = implement {@link MiniGameDefinition}
 * (see games/types.ts) and add one registerGame call here — the panel, the
 * registry, and the other games never change.
 */
import { registerGame, getGame } from './registry.ts'
import { dinoGame } from './dino/index.ts'
import { tetrisGame } from './tetris/index.ts'
import { tanksGame } from './tanks/index.ts'
import { match3Game } from './match3/index.ts'

export { getGames, getGame } from './registry.ts'
export { registerGame } from './registry.ts'
export type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from './types.ts'

export function registerBuiltinGames(): void {
  // Idempotent: the bundle factory re-executes on client-plugin HMR reloads,
  // so a second pass must not trip the registry's duplicate guard.
  for (const game of [dinoGame, tetrisGame, tanksGame, match3Game]) {
    if (getGame(game.id) === undefined) registerGame(game)
  }
}
