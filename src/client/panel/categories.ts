/**
 * 游戏分类：六类 + 全部。面板选择器的标签栏按此过滤 107 张卡。
 * 每个游戏恰好属于一类；tests/categories.spec.ts 锁定全覆盖。
 */

/** 一个分类的展示信息。 */
export interface Category {
  readonly id: string
  readonly label: string
  readonly icon: string
}

/** 分类目录（展示顺序）。 */
export const CATEGORIES: readonly Category[] = [
  { id: 'puzzle', label: '解谜', icon: '🧩' },
  { id: 'board', label: '棋牌', icon: '♟️' },
  { id: 'arcade', label: '街机', icon: '🕹️' },
  { id: 'reflex', label: '反应', icon: '⚡' },
  { id: 'physics', label: '物理·运动', icon: '🎯' },
  { id: 'casual', label: '休闲', icon: '🎲' },
]

/** 游戏 id → 分类 id；未登记的游戏回落到休闲（测试会抓到遗漏）。 */
const CATEGORY_OF: Readonly<Record<string, string>> = {
  // 解谜
  minesweeper: 'puzzle', sudoku: 'puzzle', nonogram: 'puzzle', lightsout: 'puzzle',
  hitori: 'puzzle', nurikabe: 'puzzle', heyawake: 'puzzle', fillomino: 'puzzle',
  suguru: 'puzzle', taiji: 'puzzle', masyu: 'puzzle', hashi: 'puzzle',
  slitherlink: 'puzzle', kakuro: 'puzzle', skyscrapers: 'puzzle', shikaku: 'puzzle',
  tents: 'puzzle', dominosa: 'puzzle', floodit: 'puzzle', sokoban: 'puzzle',
  rushhour: 'puzzle', maze: 'puzzle', hanoi: 'puzzle', fifteen: 'puzzle',
  peg: 'puzzle', pipes: 'puzzle', flow: 'puzzle', wordle: 'puzzle',
  mastermind: 'puzzle', circlemath: 'puzzle', game24: 'puzzle', tangram: 'puzzle',
  spotdiff: 'puzzle', memory: 'puzzle', match3: 'puzzle',
  // 棋牌
  chess: 'board', xiangqi: 'board', gomoku: 'board', othello: 'board',
  connect4: 'board', minigo: 'board', blackjack: 'board', yahtzee: 'board',
  solitaire: 'board', mahjong: 'board',
  // 街机
  dino: 'arcade', tetris: 'arcade', snake: 'arcade', pacman: 'arcade',
  breakout: 'arcade', invaders: 'arcade', asteroids: 'arcade', danmaku: 'arcade',
  frogger: 'arcade', bomber: 'arcade', bubble: 'arcade', zuma: 'arcade',
  colorlines: 'arcade', puyo: 'arcade', hop: 'arcade', flappy: 'arcade',
  dodger: 'arcade', stack: 'arcade', jumper: 'arcade', avalanche: 'arcade',
  suika: 'arcade', tanks: 'arcade', td: 'arcade', slither: 'arcade',
  jungle: 'arcade', fruitslash: 'arcade', gravflip: 'arcade', copter: 'arcade',
  whack: 'arcade', piano: 'arcade',
  // 反应
  aimtrack: 'reflex', simon: 'reflex', schulte: 'reflex', stroop: 'reflex',
  reaction: 'reflex', typing: 'reflex', juggle: 'reflex', steadyhand: 'reflex',
  qwop: 'reflex',
  // 物理·运动
  slingshot: 'physics', grapple: 'physics', sailing: 'physics', pinball: 'physics',
  pool: 'physics', bowling: 'physics', minigolf: 'physics', lander: 'physics',
  papertoss: 'physics', knifering: 'physics', hoopshot: 'physics', movinghoop: 'physics',
  ski: 'physics', racing: 'physics', hole: 'physics',
  // 休闲
  bubblewrap: 'casual', fishing: 'casual', eggcatcher: 'casual', coinpusher: 'casual',
}

/** 查游戏分类；未登记回落休闲（全覆盖测试把遗漏顶出来）。 */
export function categoryOf(gameId: string): string {
  return CATEGORY_OF[gameId] ?? 'casual'
}

/** 某分类在给定游戏表中的数量（标签栏显示 n）。 */
export function countByCategory(gameIds: readonly string[], catId: string): number {
  let n = 0
  for (const id of gameIds) if (categoryOf(id) === catId) n += 1
  return n
}
