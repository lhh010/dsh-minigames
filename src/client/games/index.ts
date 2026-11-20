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
import { nurikabeGame } from './nurikabe/index.ts'
import { skyscrapersGame } from './skyscrapers/index.ts'
import { kakuroGame } from './kakuro/index.ts'
import { dominosaGame } from './dominosa/index.ts'
import { hitoriGame } from './hitori/index.ts'
import { fruitslashGame } from './fruitslash/index.ts'
import { fillominoGame } from './fillomino/index.ts'
import { heyawakeGame } from './heyawake/index.ts'
import { landerGame } from './lander/index.ts'
import { fishingGame } from './fishing/index.ts'
import { bubblewrapGame } from './bubblewrap/index.ts'
import { papertossGame } from './papertoss/index.ts'
import { solitaireGame } from './solitaire/index.ts'
import { invadersGame } from './invaders/index.ts'
import { kniferingGame } from './knifering/index.ts'
import { hoopshotGame } from './hoopshot/index.ts'
import { movinghoopGame } from './movinghoop/index.ts'
import { rushhourGame } from './rushhour/index.ts'
import { skiGame } from './ski/index.ts'
import { suikaGame } from './suika/index.ts'
import { taijiGame } from './taiji/index.ts'
import { jumperGame } from './jumper/index.ts'
import { eggcatcherGame } from './eggcatcher/index.ts'
import { xiangqiGame } from './xiangqi/index.ts'
import { slitherGame } from './slither/index.ts'
import { danmakuGame } from './danmaku/index.ts'
import { suguruGame } from './suguru/index.ts'
import { avalancheGame } from './avalanche/index.ts'
import { puyoGame } from './puyo/index.ts'
import { mahjongGame } from './mahjong/index.ts'
import { minigolfGame } from './minigolf/index.ts'
import { jungleGame } from './jungle/index.ts'
import { grappleGame } from './grapple/index.ts'
import { qwopGame } from './qwop/index.ts'
import { copterGame } from './copter/index.ts'
import { gravflipGame } from './gravflip/index.ts'
import { reactionGame } from './reaction/index.ts'
import { circlemathGame } from './circlemath/index.ts'
import { lightspeedGame } from './lightspeed/index.ts'
import { stroopGame } from './stroop/index.ts'
import { yahtzeeGame } from './yahtzee/index.ts'
import { juggleGame } from './juggle/index.ts'
import { spotdiffGame } from './spotdiff/index.ts'
import { game24Game } from './game24/index.ts'
import { tangramGame } from './tangram/index.ts'
import { sailingGame } from './sailing/index.ts'
import { trafficGame } from './traffic/index.ts'
import { rhythmGame } from './rhythm/index.ts'
import { elevatorGame } from './elevator/index.ts'
import { iceslideGame } from './iceslide/index.ts'
import { linkGame } from './link/index.ts'
import { balloonGame } from './balloon/index.ts'
import { sorterGame } from './sorter/index.ts'
import { rivercrossGame } from './rivercross/index.ts'
import { shutboxGame } from './shutbox/index.ts'
import { balanceGame } from './balance/index.ts'
import { tideGame } from './tide/index.ts'
import { burgerGame } from './burger/index.ts'
import { missileGame } from './missile/index.ts'
import { bridgeGame } from './bridge/index.ts'
import { jugsGame } from './jugs/index.ts'
import { knightourGame } from './knightour/index.ts'
import { nimgameGame } from './nimgame/index.ts'
import { queens8Game } from './queens8/index.ts'
import { kenkenGame } from './kenken/index.ts'
import { futoshikiGame } from './futoshiki/index.ts'
import { ricochetGame } from './ricochet/index.ts'
import { tiltmazeGame } from './tiltmaze/index.ts'
import { morseGame } from './morse/index.ts'
import { dartsGame } from './darts/index.ts'
import { onestrokeGame } from './onestroke/index.ts'
import { magnetGame } from './magnet/index.ts'
import { bridgeBuilderGame } from './bridgebuilder/index.ts'
import { jengaGame } from './jenga/index.ts'
import { portalGame } from './portal/index.ts'
import { curlingGame } from './curling/index.ts'
import { ringtossGame } from './ringtoss/index.ts'
import { akariGame } from './akari/index.ts'
import { rainwaterGame } from './rainwater/index.ts'
import { gearsGame } from './gears/index.ts'
import { digGame } from './dig/index.ts'
import { lockpickGame } from './lockpick/index.ts'
import { colormixGame } from './colormix/index.ts'
import { farmGame } from './farm/index.ts'
import { dicemazeGame } from './dicemaze/index.ts'
import { idiomchainGame } from './idiomchain/index.ts'
import { defuseGame } from './defuse/index.ts'
import { jigsawGame } from './jigsaw/index.ts'
import { lightpathGame } from './lightpath/index.ts'
import { platesGame } from './plates/index.ts'
import { rpsGame } from './rps/index.ts'
import { petpalGame } from './petpal/index.ts'
import { bonsaiGame } from './bonsai/index.ts'
import { fishpondGame } from './fishpond/index.ts'
import { logigridGame } from './logigrid/index.ts'
import { starbattleGame } from './starbattle/index.ts'
import { alchemyGame } from './alchemy/index.ts'
import { watersortGame } from './watersort/index.ts'
import { moleculeGame } from './molecule/index.ts'
import { orbitGame } from './orbit/index.ts'
import { dominorunGame } from './dominorun/index.ts'
import { cakecutGame } from './cakecut/index.ts'
import { liardiceGame } from './liardice/index.ts'
import { caravanGame } from './caravan/index.ts'
import { rubikGame } from './rubik/index.ts'
import { battleshipGame } from './battleship/index.ts'
import { darkmazeGame } from './darkmaze/index.ts'
import { deepdiveGame } from './deepdive/index.ts'
import { backgammonGame } from './backgammon/index.ts'
import { crazy8Game } from './crazy8/index.ts'
import { clawGame } from './claw/index.ts'
import { nbackGame } from './nback/index.ts'
import { robocodeGame } from './robocode/index.ts'
import { tronGame } from './tron/index.ts'
import { artilleryGame } from './artillery/index.ts'
import { plinkoGame } from './plinko/index.ts'
import { qixGame } from './qix/index.ts'
import { firefighterGame } from './firefighter/index.ts'
import { sheepdogGame } from './sheepdog/index.ts'
import { flagsGame } from './flags/index.ts'
import { goldmineGame } from './goldmine/index.ts'
import { photohuntGame } from './photohunt/index.ts'
import { conductorGame } from './conductor/index.ts'
import { wordchainGame } from './wordchain/index.ts'
import { craneGame } from './crane/index.ts'
import { recipeGame } from './recipe/index.ts'
import { tangram2Game } from './tangram2/index.ts'
import { wordgridGame } from './wordgrid/index.ts'
import { harvestGame } from './harvest/index.ts'
import { sudokuXGame } from './sudokuX/index.ts'
import { chessendGame } from './chessend/index.ts'
import { icehockeyGame } from './icehockey/index.ts'
import { nonospinGame } from './nonospin/index.ts'
import { marblerunGame } from './marblerun/index.ts'
import { yinyangGame } from './yinyang/index.ts'
import { musicboxGame } from './musicbox/index.ts'
import { circuitbulbGame } from './circuitbulb/index.ts'
import { masyuGame } from './masyu/index.ts'
import { blackjackGame } from './blackjack/index.ts'
import { flooditGame } from './floodit/index.ts'
import { coinpusherGame } from './coinpusher/index.ts'
import { slingshotGame } from './slingshot/index.ts'
import { holeGame } from './hole/index.ts'
import { steadyhandGame } from './steadyhand/index.ts'

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
    nurikabeGame, skyscrapersGame, kakuroGame,
    dominosaGame, hitoriGame, fruitslashGame,
    fillominoGame, heyawakeGame, landerGame,
    fishingGame, bubblewrapGame, papertossGame,
    solitaireGame, invadersGame, kniferingGame,
    hoopshotGame, movinghoopGame,
    rushhourGame, skiGame, suikaGame,
    taijiGame, jumperGame, eggcatcherGame,
    xiangqiGame, slitherGame, danmakuGame, suguruGame,
    avalancheGame,
    puyoGame, mahjongGame, minigolfGame, jungleGame,
    masyuGame, blackjackGame, flooditGame, coinpusherGame,
    slingshotGame, holeGame, steadyhandGame,
    grappleGame, qwopGame, copterGame, gravflipGame,
    reactionGame, circlemathGame, lightspeedGame,
    stroopGame, yahtzeeGame, juggleGame, spotdiffGame,
    game24Game, tangramGame, sailingGame, trafficGame,
    rhythmGame, elevatorGame, iceslideGame, linkGame,
    balloonGame, sorterGame, rivercrossGame, shutboxGame,
    balanceGame, tideGame, burgerGame, missileGame,
    bridgeGame, jugsGame, knightourGame, nimgameGame,
    queens8Game, kenkenGame, futoshikiGame, ricochetGame,
    tiltmazeGame, morseGame, dartsGame, onestrokeGame,
    magnetGame, bridgeBuilderGame, jengaGame, portalGame,
    curlingGame, ringtossGame, akariGame, rainwaterGame,
    gearsGame, digGame, lockpickGame, colormixGame,
    farmGame, dicemazeGame, idiomchainGame, defuseGame,
    jigsawGame, lightpathGame, platesGame, rpsGame,
    petpalGame, bonsaiGame, fishpondGame, logigridGame, starbattleGame,
    alchemyGame, watersortGame, moleculeGame, orbitGame,
    dominorunGame, cakecutGame, liardiceGame, caravanGame,
    rubikGame, battleshipGame, darkmazeGame, deepdiveGame,
    backgammonGame, crazy8Game, clawGame, nbackGame,
    robocodeGame, tronGame, artilleryGame, plinkoGame,
    qixGame, firefighterGame, sheepdogGame, flagsGame,
    goldmineGame, photohuntGame, conductorGame, wordchainGame,
    craneGame, recipeGame, tangram2Game, wordgridGame,
    harvestGame, sudokuXGame, chessendGame,
    icehockeyGame, nonospinGame, marblerunGame, yinyangGame,
    musicboxGame, circuitbulbGame,
  ]) {
    if (getGame(game.id) === undefined) registerGame(game)
  }
}
