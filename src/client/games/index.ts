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
import { simonGame } from './simon/index.ts'
import { sokobanGame } from './sokoban/index.ts'
import { asteroidsGame } from './asteroids/index.ts'
import { pipesGame } from './pipes/index.ts'
import { colorLinesGame } from './colorlines/index.ts'
import { dodgerGame } from './dodger/index.ts'
import { typingGame } from './typing/index.ts'
import { lightsOutGame } from './lightsout/index.ts'
import { pongGame } from './pong/index.ts'
import { stackGame } from './stack/index.ts'
import { wordleGame } from './wordle/index.ts'
import { nonogramGame } from './nonogram/index.ts'
import { pegGame } from './peg/index.ts'
import { hanoiGame } from './hanoi/index.ts'
import { fifteenGame } from './fifteen/index.ts'
import { mastermindGame } from './mastermind/index.ts'
import { mazeGame } from './maze/index.ts'
import { schulteGame } from './schulte/index.ts'
import { hashiGame } from './hashi/index.ts'
import { miniGoGame } from './minigo/index.ts'
import { connect4Game } from './connect4/index.ts'
import { slitherlinkGame } from './slitherlink/index.ts'
import { racingGame } from './racing/index.ts'
import { bubbleGame } from './bubble/index.ts'
import { bomberGame } from './bomber/index.ts'
import { pianoGame } from './piano/index.ts'
import { zumaGame } from './zuma/index.ts'
import { poolGame } from './pool/index.ts'
import { tdGame } from './td/index.ts'
import { chessGame } from './chess/index.ts'
import { pinballGame } from './pinball/index.ts'
import { flowGame } from './flow/index.ts'
import { bowlingGame } from './bowling/index.ts'
import { tentsGame } from './tents/index.ts'
import { shikakuGame } from './shikaku/index.ts'
import { froggerGame } from './frogger/index.ts'

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
    dinoGame, tetrisGame, tanksGame, match3Game, snakeGame,
    game2048, minesweeperGame, memoryGame, gomokuGame, hopGame, breakoutGame,
    whackGame, othelloGame, flappyGame, sudokuGame, pacmanGame, aimTrackGame,
    simonGame, sokobanGame, asteroidsGame,
    pipesGame, colorLinesGame, dodgerGame, typingGame,
    lightsOutGame, pongGame, stackGame, wordleGame,
    nonogramGame, pegGame, hanoiGame, fifteenGame, mastermindGame, mazeGame,
    schulteGame,
    hashiGame, miniGoGame, connect4Game, slitherlinkGame,
    racingGame,
    bubbleGame, bomberGame, pianoGame,
    zumaGame, poolGame, tdGame,
    chessGame, pinballGame, flowGame, bowlingGame,
    tentsGame, shikakuGame, froggerGame,
  ]) {
    if (getGame(game.id) === undefined) registerGame(game)
  }
}
