/**
 * 字母矩阵 WordGrid 纯逻辑：种子化谜面生成（在 5×5 格子里按横/竖/斜
 * 直线种入若干隐藏目标词，允许交叉共享字母，重叠格字母必须一致）、
 * 干扰字母填充（按目标词字母占比与英文字频双档混合，关卡越高越混
 * 沓）、相邻链选取校验（含对角）、提交判定（找出/重复/错误与扣罚）、
 * 三级提示（长度→方向→首字母位置）、过关与关卡递进。无 DOM、无副作
 * 用，全部随机经注入 seed（mulberry32），同 seed 逐字节可复现。
 *
 * 盘面用一维数组表示：格子序号 = 行 * 5 + 列，值为大写字母。
 */

/** 盘面边长（固定 5×5）。 */
export const SIZE = 5

/** 每关错误提交的尝试上限。 */
export const MAX_ATTEMPTS = 10

/** 每关可用的提示次数（逐级揭示）。 */
export const MAX_HINTS = 3

/** 提示最高档：1 长度 → 2 方向 → 3 首字母位置。 */
export const MAX_HINT_STAGE = 3

/**
 * mulberry32 种子随机数发生器：同 seed 产生同一序列，全部随机经它注
 * 入，生成器可复现、可测试。
 * @param seed - 32 位种子。
 * @returns 返回 [0,1) 随机数的函数。
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Fisher-Yates 洗牌（新建数组，入参不变）。
 * @param items - 待洗牌数组。
 * @param rng - mulberry32 实例。
 * @returns 洗牌后的新数组。 */
function shuffled<T>(items: readonly T[], rng: () => number): T[] {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = out[i]!
    out[i] = out[j]!
    out[j] = tmp
  }
  return out
}

/** 内置词库：72 个常见英文词（大写，长度 4-5——5×5 格内横/竖/斜直线
 * 最多容纳 5 个字母，更长的不可能直线种入，故词长递进取 4→5）。 */
export const WORDS: readonly string[] = [
  'TIME', 'WORD', 'GAME', 'PLAY', 'FISH', 'BIRD', 'TREE', 'STAR', 'MOON',
  'ROAD', 'KING', 'RING', 'SONG', 'DOOR', 'FIRE', 'WIND', 'SNOW', 'RAIN',
  'BOAT', 'MILK', 'HAND', 'HEAD', 'FOOT', 'LEAF', 'SEED', 'GOLD', 'IRON',
  'SHIP', 'WOLF', 'BEAR', 'DUCK', 'FROG', 'LAMP', 'MAPLE', 'APPLE', 'GRAPE',
  'LEMON', 'PEARL', 'RIVER', 'OCEAN', 'BEACH', 'STONE', 'CLOUD', 'STORM',
  'LIGHT', 'NIGHT', 'SPACE', 'MUSIC', 'GREEN', 'HEART', 'SMILE', 'BRAVE',
  'CANDY', 'DREAM', 'MAGIC', 'QUEST', 'ROBOT', 'TIGER', 'ZEBRA', 'WHALE',
  'SNAKE', 'EAGLE', 'SHARK', 'CROWN', 'SWORD', 'MAP', 'CAT', 'DOG', 'SUN',
  'CAKE', 'JUICE', 'BREAD',
]

/** 英文字母频率权重（常见字母重复出现，干扰更逼真、更混淆）。 */
const FREQ_LETTERS = 'EEEEETTTTAAAAOOOIIIINNNSSSSRRRRHHHLLDDDCCUMMFFPPGGWWYYBVKXJQZ'

/** 八个直线方向：下标供线索卡与放置共用。 */
export const DIRS: readonly { dx: number; dy: number; label: string }[] = [
  { dx: 1, dy: 0, label: '横 →' },
  { dx: 1, dy: 1, label: '斜 ↘' },
  { dx: 0, dy: 1, label: '竖 ↓' },
  { dx: -1, dy: 1, label: '斜 ↙' },
  { dx: -1, dy: 0, label: '横 ←' },
  { dx: -1, dy: -1, label: '斜 ↖' },
  { dx: 0, dy: -1, label: '竖 ↑' },
  { dx: 1, dy: -1, label: '斜 ↗' },
]

/** 关卡配置：目标词数、词长区间、干扰字母来自目标词字母的概率
 * （越低越按字频混入、越难）。 */
export interface WordGridLevelConfig {
  /** 隐藏目标词数量。 */
  readonly words: number
  /** 词长下限。 */
  readonly lenMin: number
  /** 词长上限。 */
  readonly lenMax: number
  /** 干扰字母取自目标词字母池的概率（0..1）。 */
  readonly decoyBias: number
  /** HUD 关卡标签。 */
  readonly label: string
}

/** 5 关递进：词数 3→5、词长 4→5、干扰从目标字母为主过渡到英文字频
 * 混淆。 */
export const LEVELS: readonly WordGridLevelConfig[] = [
  { words: 3, lenMin: 4, lenMax: 4, decoyBias: 0.75, label: '第 1 关·入门' },
  { words: 3, lenMin: 4, lenMax: 5, decoyBias: 0.55, label: '第 2 关·进阶' },
  { words: 4, lenMin: 4, lenMax: 5, decoyBias: 0.35, label: '第 3 关·交叉' },
  { words: 4, lenMin: 5, lenMax: 5, decoyBias: 0.2, label: '第 4 关·混淆' },
  { words: 5, lenMin: 4, lenMax: 5, decoyBias: 0.05, label: '第 5 关·大师' },
]

/** 一个隐藏目标词：词、放置格子序列与方向下标。 */
export interface TargetWord {
  /** 目标词（大写）。 */
  readonly word: string
  /** 放置格子序号序列（沿方向直线）。 */
  readonly cells: readonly number[]
  /** 方向下标（DIRS 索引）。 */
  readonly dirIdx: number
  /** 是否已找出。 */
  found: boolean
}

/** 一局关卡状态（可变：提交与提示原地更新）。 */
export interface WordGridState {
  /** 关卡下标（LEVELS 索引）。 */
  readonly level: number
  /** 25 格盘面（一维，大写字母；空串为种词期占位，生成完成后必满）。 */
  readonly grid: string[]
  /** 隐藏目标词列表。 */
  readonly targets: readonly TargetWord[]
  /** 剩余尝试次数。 */
  attemptsLeft: number
  /** 剩余提示次数。 */
  hintBudget: number
  /** 每词提示档位（0..MAX_HINT_STAGE，与 targets 同长）。 */
  readonly hintStage: number[]
  /** 阶段：进行中 / 过关 / 尝试用尽 / 全部通关。 */
  phase: 'playing' | 'cleared' | 'failed' | 'won'
  /** 累计得分（跨关卡延续）。 */
  score: number
  /** 本局基础 seed（关卡 seed 由它派生，重放一致）。 */
  readonly seed: number
}

/** 提交结果分类。 */
export type SubmitKind = 'empty' | 'invalid' | 'already' | 'found' | 'wrong'

/** 一次链提交的结果。 */
export interface SubmitResult {
  /** 结果分类。 */
  readonly kind: SubmitKind
  /** 拼出的词（空链为空串）。 */
  readonly word: string
  /** 本次得分增量。 */
  readonly gain: number
  /** 命中的目标词下标（found 时有效，否则 -1）。 */
  readonly index: number
}

/** 两格是否相邻（八向切比雪夫距离 1，自身不算）。
 * @param a - 格子序号。
 * @param b - 格子序号。
 * @returns 相邻为 true。 */
export function isAdjacent(a: number, b: number): boolean {
  if (a === b) return false
  const dr = Math.abs(Math.floor(a / SIZE) - Math.floor(b / SIZE))
  const dc = Math.abs((a % SIZE) - (b % SIZE))
  return dr <= 1 && dc <= 1
}

/** 链是否合法：非空、无重复格、逐格相邻（含对角）。
 * @param chain - 格子序号序列。
 * @returns 合法为 true。 */
export function isValidChain(chain: readonly number[]): boolean {
  if (chain.length === 0) return false
  const seen = new Set<number>()
  for (let i = 0; i < chain.length; i += 1) {
    const cell = chain[i]!
    if (cell < 0 || cell >= SIZE * SIZE || seen.has(cell)) return false
    seen.add(cell)
    if (i > 0 && !isAdjacent(chain[i - 1]!, cell)) return false
  }
  return true
}

/** 能否把 cell 追加到链尾（相邻且未在链中）。
 * @param chain - 当前链。
 * @param cell - 待追加格子。
 * @returns 可追加为 true。 */
export function canExtend(chain: readonly number[], cell: number): boolean {
  if (cell < 0 || cell >= SIZE * SIZE) return false
  if (chain.includes(cell)) return false
  return chain.length === 0 || isAdjacent(chain[chain.length - 1]!, cell)
}

/** 拼出链上的词。
 * @param state - 关卡状态。
 * @param chain - 格子序号序列。
 * @returns 依次连接的字母串。 */
export function chainWord(state: WordGridState, chain: readonly number[]): string {
  return chain.map(cell => state.grid[cell] ?? '').join('')
}

/** 尝试为词找一条直线放置：随机方向与起点，要求覆盖格为空或字母相同
 * （交叉共享字母合法，冲突即重试）。
 * @param word - 目标词。
 * @param grid - 种词中的盘面（原地写回）。
 * @param rng - mulberry32 实例。
 * @returns 放置信息，60 次尝试均失败为 null。 */
function tryPlace(word: string, grid: string[], rng: () => number): { cells: number[]; dirIdx: number } | null {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const dirIdx = Math.floor(rng() * DIRS.length)
    const dir = DIRS[dirIdx]!
    const startCol = Math.floor(rng() * SIZE)
    const startRow = Math.floor(rng() * SIZE)
    const endCol = startCol + dir.dx * (word.length - 1)
    const endRow = startRow + dir.dy * (word.length - 1)
    if (endCol < 0 || endCol >= SIZE || endRow < 0 || endRow >= SIZE) continue
    const cells: number[] = []
    let ok = true
    for (let i = 0; i < word.length; i += 1) {
      const r = startRow + dir.dy * i
      const c = startCol + dir.dx * i
      const idx = r * SIZE + c
      cells.push(idx)
      const cur = grid[idx]!
      if (cur !== '' && cur !== word[i]) { ok = false; break }
    }
    if (!ok) continue
    for (let i = 0; i < word.length; i += 1) grid[cells[i]!] = word[i]!
    return { cells, dirIdx }
  }
  return null
}

/** 生成一关状态：种子词、填干扰、初始化提示与计分。
 * @param level - 关卡下标（LEVELS 索引）。
 * @param seed - 基础 seed（关卡 seed 派生自它，重放一致）。
 * @param carryScore - 上一关带入的累计分。
 * @returns 就绪的可变关卡状态（phase 为 playing）。 */
export function createLevelState(level: number, seed: number, carryScore = 0): WordGridState {
  const cfg = LEVELS[level]!
  const rng = mulberry32((seed ^ Math.imul(level + 1, 0x9e3779b9)) >>> 0)
  const grid: string[] = new Array<string>(SIZE * SIZE).fill('')
  const targets: TargetWord[] = []
  const pool = WORDS.filter(w => w.length >= cfg.lenMin && w.length <= cfg.lenMax)
  // 两轮候选扫描兜底：第一轮不足时再洗一轮补齐（72 词下几乎不会触发）。
  for (let round = 0; round < 2 && targets.length < cfg.words; round += 1) {
    for (const word of shuffled(pool, rng)) {
      if (targets.length >= cfg.words) break
      if (targets.some(t => t.word === word)) continue
      const placed = tryPlace(word, grid, rng)
      if (placed !== null) targets.push({ word, cells: placed.cells, dirIdx: placed.dirIdx, found: false })
    }
  }
  // 干扰填充：decoyBias 概率从目标词字母池取（低关卡更友好），否则按
  // 英文字频抽样（高关卡更混淆）。
  const targetLetters = targets.map(t => t.word).join('')
  for (let i = 0; i < grid.length; i += 1) {
    if (grid[i] !== '') continue
    if (targetLetters !== '' && rng() < cfg.decoyBias) {
      grid[i] = targetLetters[Math.floor(rng() * targetLetters.length)]!
    } else {
      grid[i] = FREQ_LETTERS[Math.floor(rng() * FREQ_LETTERS.length)]!
    }
  }
  return {
    level,
    grid,
    targets,
    attemptsLeft: MAX_ATTEMPTS,
    hintBudget: MAX_HINTS,
    hintStage: new Array<number>(targets.length).fill(0),
    phase: 'playing',
    score: carryScore,
    seed,
  }
}

/** 提交选词链：按拼出的词判定——是未找出的隐藏词则记分锁定；是已找
 * 出的词不扣罚；否则扣一次尝试（扣尽即失败）。链本身非法（断链/重复
 * 格/空链）不扣罚、只判 invalid。
 * @param state - 关卡状态（原地更新）。
 * @param chain - 格子序号序列。
 * @returns 提交结果。 */
export function submitChain(state: WordGridState, chain: readonly number[]): SubmitResult {
  if (chain.length === 0) return { kind: 'empty', word: '', gain: 0, index: -1 }
  if (!isValidChain(chain)) return { kind: 'invalid', word: chainWord(state, chain), gain: 0, index: -1 }
  const word = chainWord(state, chain)
  const idx = state.targets.findIndex(t => t.word === word)
  if (idx >= 0 && state.targets[idx]!.found) {
    return { kind: 'already', word, gain: 0, index: idx }
  }
  if (idx < 0) {
    state.attemptsLeft -= 1
    if (state.attemptsLeft <= 0) state.phase = 'failed'
    return { kind: 'wrong', word, gain: 0, index: -1 }
  }
  const target = state.targets[idx]!
  target.found = true
  const gain = word.length * 10
  state.score += gain
  if (state.targets.every(t => t.found)) {
    state.score += state.attemptsLeft * 5 + 25
    state.phase = state.level >= LEVELS.length - 1 ? 'won' : 'cleared'
  }
  return { kind: 'found', word, gain, index: idx }
}

/** 第一个未找出且未揭满档的目标词下标：提示沿卡逐级揭示（长度→方向→
 * 首字母位置），揭满或找出后顺延到下一张卡。
 * @param state - 关卡状态。
 * @returns 目标词下标，无可提示为 -1。 */
function nextHintIndex(state: WordGridState): number {
  for (let i = 0; i < state.targets.length; i += 1) {
    const t = state.targets[i]!
    if (!t.found && state.hintStage[i]! < MAX_HINT_STAGE) return i
  }
  return -1
}

/** 使用一次提示：把下一个可提示目标词的线索卡升一档（长度→方向→首
 * 字母位置），消耗一次机会。
 * @param state - 关卡状态（原地更新）。
 * @returns 升档的目标词下标，无机会或无可升档为 -1。 */
export function revealHint(state: WordGridState): number {
  if (state.phase !== 'playing' || state.hintBudget <= 0) return -1
  const idx = nextHintIndex(state)
  if (idx < 0) return -1
  state.hintStage[idx] = state.hintStage[idx]! + 1
  state.hintBudget -= 1
  return idx
}

/** 过关后进入下一关（沿用基础 seed 与累计分）。
 * @param state - 当前状态。
 * @returns cleared 时返回新关状态，否则原样返回。 */
export function nextLevelState(state: WordGridState): WordGridState {
  if (state.phase !== 'cleared') return state
  return createLevelState(state.level + 1, state.seed, state.score)
}

/** 首字母位置线索文本（1 起行列）。
 * @param target - 目标词。
 * @returns 如 '第2行第3列'。 */
export function startPosText(target: TargetWord): string {
  const first = target.cells[0]!
  return '第' + (Math.floor(first / SIZE) + 1) + '行第' + ((first % SIZE) + 1) + '列'
}
