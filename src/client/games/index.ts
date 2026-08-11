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
import { huarongGame } from './huarong/index.ts'
import { snakeGame } from './snake/index.ts'
import { game2048 } from './game2048/index.ts'
import { minesweeperGame } from './minesweeper/index.ts'
import { memoryGame } from './memory/index.ts'
import { gomokuGame } from './gomoku/index.ts'
import { hopGame } from './hop/index.ts'
import { breakoutGame } from './breakout/index.ts'
import { whackGame } from './whack/index.ts'
import { othelloGame } from './othello/index.ts'
import { flappyGame } from './flappy/index.ts'
import { sudokuGame } from './sudoku/index.ts'
import { pacmanGame } from './pacman/index.ts'
import { aimTrackGame } from './aimtrack/index.ts'

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
  for (const game of [
    dinoGame, tetrisGame, tanksGame, match3Game, huarongGame, snakeGame,
    game2048, minesweeperGame, memoryGame, gomokuGame, hopGame, breakoutGame,
    whackGame, othelloGame, flappyGame, sudokuGame, pacmanGame, aimTrackGame,
  ]) {
    if (getGame(game.id) === undefined) registerGame(game)
  }
}
