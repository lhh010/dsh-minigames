/**
 * 残局挑战 ChessEnd 纯逻辑：8x8 国际象棋残局状态机与受限深度的确定性
 * 搜索引擎。规则简化：不支持王车易位与吃过路兵；兵升变自动成后。
 * 防守方（黑方）由引擎代走：黑方 1 层 + 白方最强应手评估，带种子噪声；
 * 白方提示用白 2 层 + 黑 1 层搜索。所有随机经 mulberry32 注入种子，
 * 同种子下整局走子序列可精确重放。
 */

/** 棋盘：64 字符字符串，索引 0 = a8、63 = h1；'.' 为空，大写为白方。 */
export type Board = string

/** 行棋方。 */
export type Side = 'w' | 'b'

/** 一步棋：起止格索引。 */
export interface ChessMove { from: number, to: number }

/** 单个残局题目。 */
export interface ChessEndPuzzle {
  /** 唯一 id。 */
  id: string
  /** 中文标题。 */
  title: string
  /** 目标类型：将杀 / 兵升变 / 得子。 */
  goal: 'mate' | 'promote' | 'material'
  /** 目标的一句话说明（HUD 显示）。 */
  goalText: string
  /** 参考步数：≤ PAR 满分，每超 1 步扣 10 分。 */
  par: number
  /** rank8 → rank1 每行 8 字符的初始局面。 */
  rows: string[]
  /** goal 为 material 时，白方子力分差需达到的最小值。 */
  advantage?: number
}

/** 将杀分值（越大越接近立即将杀）。 */
export const MATE_SCORE = 100000

/** 防守方决策噪声幅度（厘兵单位，mulberry32 驱动）。 */
export const ENGINE_NOISE = 36

/** 子力价值（厘兵）。 */
const PIECE_VALUE: Record<string, number> = { P: 100, N: 300, B: 310, R: 500, Q: 900, K: 0 }

/** 白兵按所在行（0 = 对方底线侧）的推进加分，鼓励引擎推兵升变。 */
const PAWN_ADV = [0, 500, 320, 220, 140, 80, 40, 0]

/** 马的 8 个偏移（行、列）。 */
const KNIGHT_DELTAS: ReadonlyArray<readonly [number, number]> = [
  [-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1],
]

/** 王的 8 个偏移（行、列）。 */
const KING_DELTAS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1],
]

/** 车向（上下左右）。 */
const ROOK_DIRS: ReadonlyArray<readonly [number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]]

/** 象向（四斜线）。 */
const BISHOP_DIRS: ReadonlyArray<readonly [number, number]> = [[-1, -1], [-1, 1], [1, -1], [1, 1]]

/**
 * mulberry32 伪随机数发生器：种子确定则序列确定。
 * @param seed - 非负整数种子。
 * @returns 返回 [0, 1) 随机数的函数。
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return (): number => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 行号（0 = rank8）。 */
const rowOf = (sq: number): number => sq >> 3
/** 列号（0 = a 线）。 */
const colOf = (sq: number): number => sq & 7
/** 行列在盘内。 */
const inside = (r: number, c: number): boolean => r >= 0 && r < 8 && c >= 0 && c < 8

/**
 * 由 8 行棋子字符串构造棋盘。
 * @param rows - rank8 → rank1 每行 8 字符，'.' 为空。
 * @returns 64 字符棋盘。
 */
export function parseRows(rows: string[]): Board {
  if (rows.length !== 8) throw new Error('chessend: 需要恰好 8 行')
  for (const row of rows) {
    if (row.length !== 8) throw new Error('chessend: 每行需恰好 8 字符')
  }
  return rows.join('')
}

/**
 * 棋子归属方。
 * @param piece - 棋子字符（'.' 为空）。
 * @returns 'w' / 'b' / ''（空）。
 */
export function colorOf(piece: string): Side | '' {
  if (piece === '.' || piece === undefined) return ''
  return piece >= 'A' && piece <= 'Z' ? 'w' : 'b'
}

/**
 * 格名的代数记法（索引 0 → 'a8'）。
 * @param sq - 格索引。
 * @returns 如 'e2' 的坐标名。
 */
export function sqName(sq: number): string {
  return 'abcdefgh'[colOf(sq)]! + String(8 - rowOf(sq))
}

/** 伪合法走法（未过滤送王）：含兵推进 / 吃子，升变在落子时自动成后。 */
function pseudoMoves(board: Board, side: Side): ChessMove[] {
  const moves: ChessMove[] = []
  const push = (from: number, to: number): void => {
    // 各走法分支已用 inside 校验行列，这里仅组装。
    moves.push({ from, to })
  }
  for (let sq = 0; sq < 64; sq += 1) {
    const piece = board[sq]!
    if (colorOf(piece) !== side) continue
    const upper = piece.toUpperCase()
    const r = rowOf(sq)
    const c = colOf(sq)
    if (upper === 'P') {
      const dir = side === 'w' ? -1 : 1
      const startRow = side === 'w' ? 6 : 1
      const oneR = r + dir
      if (inside(oneR, c) && board[oneR * 8 + c] === '.') {
        push(sq, oneR * 8 + c)
        const twoR = r + dir * 2
        if (r === startRow && board[twoR * 8 + c] === '.') push(sq, twoR * 8 + c)
      }
      for (const dc of [-1, 1]) {
        const tc = c + dc
        if (!inside(oneR, tc)) continue
        const target = oneR * 8 + tc
        if (colorOf(board[target]!) === (side === 'w' ? 'b' : 'w')) push(sq, target)
      }
    } else if (upper === 'N' || upper === 'K') {
      const deltas = upper === 'N' ? KNIGHT_DELTAS : KING_DELTAS
      for (const [dr, dc] of deltas) {
        const tr = r + dr
        const tc = c + dc
        if (!inside(tr, tc)) continue
        const target = tr * 8 + tc
        if (colorOf(board[target]!) !== side) push(sq, target)
      }
    } else {
      const dirs = upper === 'R' ? ROOK_DIRS : upper === 'B' ? BISHOP_DIRS : [...ROOK_DIRS, ...BISHOP_DIRS]
      for (const [dr, dc] of dirs) {
        let tr = r + dr
        let tc = c + dc
        while (inside(tr, tc)) {
          const target = tr * 8 + tc
          const occ = board[target]!
          if (occ === '.') {
            push(sq, target)
          } else {
            if (colorOf(occ) !== side) push(sq, target)
            break
          }
          tr += dr
          tc += dc
        }
      }
    }
  }
  return moves
}

/**
 * 某格是否被指定方攻击（用于将军与王安全判定）。
 * @param board - 当前棋盘。
 * @param sq - 被查格索引。
 * @param by - 攻击方。
 * @returns 被攻击返回 true。
 */
export function attacksSquare(board: Board, sq: number, by: Side): boolean {
  if (sq < 0 || sq > 63) return false
  const r = rowOf(sq)
  const c = colOf(sq)
  const enemy = (p: string, u: string): boolean => colorOf(p) === by && p.toUpperCase() === u
  for (const [dr, dc] of KNIGHT_DELTAS) {
    const tr = r + dr
    const tc = c + dc
    if (inside(tr, tc) && enemy(board[tr * 8 + tc]!, 'N')) return true
  }
  for (const [dr, dc] of KING_DELTAS) {
    const tr = r + dr
    const tc = c + dc
    if (inside(tr, tc) && enemy(board[tr * 8 + tc]!, 'K')) return true
  }
  // 兵攻击斜前方一格：白兵在受攻格下一行。
  const pr = by === 'w' ? r + 1 : r - 1
  for (const dc of [-1, 1]) {
    const tc = c + dc
    if (inside(pr, tc) && enemy(board[pr * 8 + tc]!, 'P')) return true
  }
  const rayHit = (dirs: ReadonlyArray<readonly [number, number]>, units: string[]): boolean => {
    for (const [dr, dc] of dirs) {
      let tr = r + dr
      let tc = c + dc
      while (inside(tr, tc)) {
        const p = board[tr * 8 + tc]!
        if (p !== '.') {
          if (units.some((u) => enemy(p, u))) return true
          break
        }
        tr += dr
        tc += dc
      }
    }
    return false
  }
  if (rayHit(ROOK_DIRS, ['R', 'Q'])) return true
  return rayHit(BISHOP_DIRS, ['B', 'Q'])
}

/**
 * 某方王的格索引（供渲染将军红圈等定位）。
 * @param board - 当前棋盘。
 * @param side - 查找方。
 * @returns 格索引，找不到返回 -1。
 */
export function findKing(board: Board, side: Side): number {
  return board.indexOf(side === 'w' ? 'K' : 'k')
}

/**
 * 某方是否被将军。
 * @param board - 当前棋盘。
 * @param side - 被查方。
 */
export function inCheck(board: Board, side: Side): boolean {
  const ks = findKing(board, side)
  if (ks < 0) return false
  return attacksSquare(board, ks, side === 'w' ? 'b' : 'w')
}

/**
 * 合法走法：伪合法过滤掉走后己王被攻击的走法。
 * @param board - 当前棋盘。
 * @param side - 行棋方。
 */
export function legalMoves(board: Board, side: Side): ChessMove[] {
  const result: ChessMove[] = []
  for (const m of pseudoMoves(board, side)) {
    if (!inCheck(makeMove(board, m).board, side)) result.push(m)
  }
  return result
}

/** 落子结果：新棋盘 + 被吃子 + 是否发生升变（自动成后）。 */
export interface MoveResult { board: Board, captured: string, promoted: boolean }

/**
 * 落子（不可变：返回新棋盘）。兵到达底线自动升变为后；不支持易位与吃过路兵。
 * @param board - 走之前的棋盘。
 * @param move - 起止格。
 * @returns 新棋盘与被吃子信息。
 */
export function makeMove(board: Board, move: ChessMove): MoveResult {
  const chars = board.split('')
  const moving = chars[move.from]!
  const captured = chars[move.to]!
  chars[move.from] = '.'
  let promoted = false
  if (moving === 'P' && rowOf(move.to) === 0) { chars[move.to] = 'Q'; promoted = true }
  else if (moving === 'p' && rowOf(move.to) === 7) { chars[move.to] = 'q'; promoted = true }
  else { chars[move.to] = moving }
  return { board: chars.join(''), captured, promoted }
}

/**
 * 某方是否被将杀（被将军且无合法走法）。
 * @param board - 当前棋盘。
 * @param side - 被查方。
 */
export function isCheckmate(board: Board, side: Side): boolean {
  return inCheck(board, side) && legalMoves(board, side).length === 0
}

/**
 * 某方是否被逼和（未被将军且无合法走法）。
 * @param board - 当前棋盘。
 * @param side - 被查方。
 */
export function isStalemate(board: Board, side: Side): boolean {
  return !inCheck(board, side) && legalMoves(board, side).length === 0
}

/**
 * 子力分差（白方视角，厘兵）。
 * @param board - 当前棋盘。
 * @returns 白方子力总和减黑方子力总和。
 */
export function materialDiff(board: Board): number {
  let diff = 0
  for (let sq = 0; sq < 64; sq += 1) {
    const p = board[sq]!
    if (p === '.') continue
    const v = PIECE_VALUE[p.toUpperCase()] ?? 0
    diff += colorOf(p) === 'w' ? v : -v
  }
  return diff
}

/** 纯子力 + 兵推进（不含王安全，用于最深一层叶子以控制搜索耗时）。 */
function materialEval(board: Board): number {
  let diff = 0
  for (let sq = 0; sq < 64; sq += 1) {
    const p = board[sq]!
    if (p === '.') continue
    const upper = p.toUpperCase()
    const v = PIECE_VALUE[upper] ?? 0
    if (p === 'P') diff += v + PAWN_ADV[rowOf(sq)]!
    else if (p === 'p') diff -= v + PAWN_ADV[7 - rowOf(sq)]!
    else diff += colorOf(p) === 'w' ? v : -v
  }
  return diff
}

/** 数一格周围 8 格中被敌方攻击的数量（王安全度量）。 */
function attackedNeighbors(board: Board, sq: number, by: Side): number {
  let count = 0
  const r = rowOf(sq)
  const c = colOf(sq)
  for (const [dr, dc] of KING_DELTAS) {
    const tr = r + dr
    const tc = c + dc
    if (inside(tr, tc) && attacksSquare(board, tr * 8 + tc, by)) count += 1
  }
  return count
}

/** 王安全项（白方视角）：敌火覆盖对方王周围加分，己王周围被覆盖减分。 */
function kingSafety(board: Board): number {
  let score = 0
  const wk = findKing(board, 'w')
  const bk = findKing(board, 'b')
  if (wk >= 0) score -= 14 * attackedNeighbors(board, wk, 'b')
  if (bk >= 0) score += 14 * attackedNeighbors(board, bk, 'w')
  if (bk >= 0 && inCheck(board, 'b')) score += 30
  if (wk >= 0 && inCheck(board, 'w')) score -= 30
  return score
}

/**
 * 完整静态评估 = 子力 + 兵推进 + 王安全（白方视角，确定性）。
 * @param board - 当前棋盘。
 * @returns 分值，越大白方越优。
 */
export function evaluate(board: Board): number {
  return materialEval(board) + kingSafety(board)
}

/** 白方搜索结果。 */
export interface SearchResult { move: ChessMove | null, score: number }

/**
 * 白方搜索：己方 2 层 + 对方 1 层（白 → 黑 → 白 → 静态评估），将杀按
 * 步数递减计分优先选择，遍历顺序固定，完全确定。
 * @param board - 白方行棋的棋盘。
 * @returns 最优走法与分值；无合法走法时 move 为 null。
 */
export function searchWhite(board: Board): SearchResult {
  let best: ChessMove | null = null
  let bestScore = -Infinity
  for (const m1 of legalMoves(board, 'w')) {
    const s1 = makeMove(board, m1)
    const replies = legalMoves(s1.board, 'b')
    let score: number
    if (replies.length === 0) {
      score = inCheck(s1.board, 'b') ? MATE_SCORE - 1 : 0
    } else {
      let worst = Infinity
      for (const r of replies) {
        const s2 = makeMove(s1.board, r)
        const second = legalMoves(s2.board, 'w')
        let inner: number
        if (second.length === 0) {
          inner = inCheck(s2.board, 'w') ? -(MATE_SCORE - 2) : 0
        } else {
          let bestInner = -Infinity
          for (const m2 of second) {
            const s3 = makeMove(s2.board, m2)
            const after = legalMoves(s3.board, 'b')
            const v = after.length === 0
              ? (inCheck(s3.board, 'b') ? MATE_SCORE - 3 : 0)
              : materialEval(s3.board)
            if (v > bestInner) bestInner = v
          }
          inner = bestInner + kingSafety(s2.board)
        }
        if (inner < worst) worst = inner
      }
      score = worst
    }
    if (score > bestScore) { bestScore = score; best = m1 }
  }
  return { move: best, score: bestScore }
}

/**
 * 黑方防守走法：黑 1 层，每个候选以「白方最强应手（含将杀识别）」打分，
 * 加 mulberry32 噪声后取最大；噪声为 0 时不消耗随机数，任意种子同走法。
 * @param board - 黑方行棋的棋盘。
 * @param rng - 种子随机源。
 * @param noise - 噪声幅度（0 表示完全确定性）。
 * @returns 黑方走法；黑无合法走法返回 null。
 */
export function defenderMove(board: Board, rng: () => number, noise: number): ChessMove | null {
  const moves = legalMoves(board, 'b')
  if (moves.length === 0) return null
  let best = moves[0]!
  let bestScore = -Infinity
  for (const m of moves) {
    const s1 = makeMove(board, m)
    const white = legalMoves(s1.board, 'w')
    let reply: number
    if (white.length === 0) {
      reply = inCheck(s1.board, 'w') ? MATE_SCORE - 1 : 0
    } else {
      let bestW = -Infinity
      for (const w of white) {
        const s2 = makeMove(s1.board, w)
        const black2 = legalMoves(s2.board, 'b')
        const v = black2.length === 0
          ? (inCheck(s2.board, 'b') ? MATE_SCORE - 2 : 0)
          : evaluate(s2.board)
        if (v > bestW) bestW = v
      }
      reply = bestW
    }
    const noisy = -reply + (noise > 0 ? (rng() - 0.5) * 2 * noise : 0)
    if (noisy > bestScore) { bestScore = noisy; best = m }
  }
  return best
}

/** 内置 8 个经典残局：将杀 / 升变 / 得子训练，白方行棋。 */
export const PUZZLES: ChessEndPuzzle[] = [
  {
    id: 'rook-king', title: '车杀单王', goal: 'mate', goalText: '将杀黑王（车盒式收缩）', par: 10,
    rows: ['....k...', '........', '......K.', '........', '........', '........', '........', 'R.......'],
  },
  {
    id: 'queen-king', title: '后杀单王', goal: 'mate', goalText: '将杀黑王（后王配合）', par: 8,
    rows: ['......k.', '........', '......K.', '........', '........', '........', '........', '...Q....'],
  },
  {
    id: 'two-rooks', title: '双堡杀', goal: 'mate', goalText: '双车梯次将杀黑王', par: 10,
    rows: ['........', '........', '........', '....k...', '........', '..K.....', '.R......', 'R.......'],
  },
  {
    id: 'pawn-promotion', title: '兵升变', goal: 'promote', goalText: '把兵推向底线升变（自动成后）', par: 8,
    rows: ['........', '...k....', '........', '...KP...', '........', '........', '........', '........'],
  },
  {
    id: 'kingside-attack', title: '王翼攻击', goal: 'mate', goalText: '后马联攻撕开黑王防线', par: 8,
    rows: ['.....rk.', '.....ppp', '........', '.......Q', '........', '.....N..', '........', '..K.....'],
  },
  {
    id: 'back-rank', title: '底线杀', goal: 'mate', goalText: '一步底线将杀', par: 1,
    rows: ['......k.', 'pppp.ppp', '.n......', '........', '........', '........', '........', '....R.K.'],
  },
  {
    id: 'deflection', title: '引离战术', goal: 'mate', goalText: 'Qe8+ 引离守车后底线杀', par: 2,
    rows: ['...r..k.', '.....ppp', '........', '........', '........', '........', '....Q...', '....R.K.'],
  },
  {
    id: 'smothered', title: '闷杀', goal: 'mate', goalText: '一步闷杀：马照角，王无路', par: 1,
    rows: ['......rk', '......pp', '........', '......N.', '........', '........', '........', '..K.....'],
  },
]

/** 对局状态：pure 数据快照，供 render 与测试直接消费。 */
export interface ChessEndState {
  /** 题目与索引。 */
  puzzle: ChessEndPuzzle
  puzzleIndex: number
  /** 当前棋盘。 */
  board: Board
  /** 玩家已走步数。 */
  moveCount: number
  /** 悔棋栈：每次玩家走子前的棋盘快照。 */
  history: Board[]
  /** 对局状态。 */
  status: 'playing' | 'won' | 'draw' | 'lost'
  /** 底栏提示消息（非法走法 / 将军 / 结果）。 */
  message: string
  /** 过关得分（未过关为 0）。 */
  score: number
  /** 剩余提示次数。 */
  hintsLeft: number
  /** 最近一次玩家走子与引擎应手（高亮用）。 */
  lastPlayer: ChessMove | null
  lastReply: ChessMove | null
  /** 种子随机源（防守方噪声）。 */
  rng: () => number
}

/** 玩家走子结果。 */
export interface ChessEndMoveResult { ok: boolean, reason: string, state: ChessEndState }

/**
 * PAR 计分：≤ PAR 满分 100，每超 1 步扣 10，下限 20。
 * @param par - 参考步数。
 * @param moves - 实际步数。
 */
export function computeScore(par: number, moves: number): number {
  if (moves <= par) return 100
  return Math.max(20, 100 - (moves - par) * 10)
}

/**
 * 目标是否达成（在玩家走子后的棋盘上判定）。
 * @param board - 玩家走子后的棋盘。
 * @param puzzle - 题目。
 * @param promoted - 这步是否发生升变。
 */
export function goalMet(board: Board, puzzle: ChessEndPuzzle, promoted: boolean): boolean {
  if (puzzle.goal === 'mate') return isCheckmate(board, 'b')
  if (puzzle.goal === 'promote') return promoted
  return materialDiff(board) >= (puzzle.advantage ?? Infinity)
}

/**
 * 白方某棋子的合法落点。
 * @param board - 当前棋盘。
 * @param from - 起点格索引。
 * @returns 合法落点索引数组（起点无白子为空）。
 */
export function legalTargets(board: Board, from: number): number[] {
  if (from < 0 || from > 63 || colorOf(board[from]!) !== 'w') return []
  return legalMoves(board, 'w').filter((m) => m.from === from).map((m) => m.to)
}

/**
 * 走法的人类可读标签（如 'Qe2-e8' / 'Rxa7'）。
 * @param board - 走之前的棋盘。
 * @param move - 走法。
 */
export function moveLabel(board: Board, move: ChessMove): string {
  const piece = board[move.from]!.toUpperCase()
  const sep = board[move.to] === '.' ? '-' : 'x'
  return piece + sqName(move.from) + sep + sqName(move.to)
}

/**
 * 通用开局：以题目 + 种子构造对局状态。
 * @param puzzle - 题目定义。
 * @param puzzleIndex - 题目索引（HUD / 切题用）。
 * @param seed - 防守方噪声种子。
 */
export function createState(puzzle: ChessEndPuzzle, puzzleIndex: number, seed: number): ChessEndState {
  return {
    puzzle,
    puzzleIndex,
    board: parseRows(puzzle.rows),
    moveCount: 0,
    history: [],
    status: 'playing',
    message: '',
    score: 0,
    hintsLeft: 3,
    lastPlayer: null,
    lastReply: null,
    rng: mulberry32(seed),
  }
}

/**
 * 以内置题库开局。
 * @param puzzleIndex - 题目索引（越界取模）。
 * @param seed - 防守方噪声种子。
 */
export function createChessEndState(puzzleIndex: number, seed: number): ChessEndState {
  const puzzle = PUZZLES[((puzzleIndex % PUZZLES.length) + PUZZLES.length) % PUZZLES.length]!
  return createState(puzzle, ((puzzleIndex % PUZZLES.length) + PUZZLES.length) % PUZZLES.length, seed)
}

/**
 * 玩家（白方）走子：非法即拒绝并给出理由；合法则落子、判目标，未达目标
 * 由引擎代走黑方应手。返回新状态（原状态不变）。
 * @param state - 当前状态。
 * @param from - 起点格索引。
 * @param to - 终点格索引。
 */
export function applyPlayerMove(state: ChessEndState, from: number, to: number): ChessEndMoveResult {
  if (state.status !== 'playing') return { ok: false, reason: '对局已结束，按 R 重开', state }
  const piece = state.board[from]!
  if (colorOf(piece) !== 'w') return { ok: false, reason: '请点击白方棋子', state }
  if (!legalTargets(state.board, from).includes(to)) {
    return { ok: false, reason: '非法走法：不合规则或会让己王暴露被将', state }
  }
  const step = makeMove(state.board, { from, to })
  let next: ChessEndState = {
    ...state,
    board: step.board,
    history: [...state.history, state.board],
    moveCount: state.moveCount + 1,
    lastPlayer: { from, to },
    lastReply: null,
    message: '',
  }
  const black = legalMoves(step.board, 'b')
  if (black.length === 0) {
    if (inCheck(step.board, 'b')) {
      return { ok: true, reason: '', state: finish(next, '将杀！黑王无路可走') }
    }
    next = { ...next, status: 'draw', message: '逼和：黑方无子可动且未被将军' }
    return { ok: true, reason: '', state: next }
  }
  if (goalMet(step.board, state.puzzle, step.promoted)) {
    const text = state.puzzle.goal === 'promote' ? '兵升变成功！' : '目标达成！'
    return { ok: true, reason: '', state: finish(next, text) }
  }
  const reply = defenderMove(step.board, state.rng, ENGINE_NOISE)!
  const afterReply = makeMove(step.board, reply)
  next = { ...next, board: afterReply.board, lastReply: reply }
  if (legalMoves(afterReply.board, 'w').length === 0) {
    if (inCheck(afterReply.board, 'w')) {
      next = { ...next, status: 'lost', message: '白王被将杀——按 R 重开再试' }
    } else {
      next = { ...next, status: 'draw', message: '逼和：白方无子可动' }
    }
    return { ok: true, reason: '', state: next }
  }
  if (inCheck(afterReply.board, 'w')) next = { ...next, message: '将军！白王正被将军' }
  return { ok: true, reason: '', state: next }
}

/** 过关收尾：计分并定格状态。 */
function finish(state: ChessEndState, message: string): ChessEndState {
  return { ...state, status: 'won', score: computeScore(state.puzzle.par, state.moveCount), message }
}

/**
 * 悔棋：回退「玩家走子 + 引擎应手」一整回合；仅在未结束时可用。
 * @param state - 当前状态。
 * @returns 回退后的新状态（无可悔时原样返回）。
 */
export function undoMove(state: ChessEndState): ChessEndState {
  if (state.status !== 'playing' || state.history.length === 0) return state
  const history = state.history.slice()
  const board = history.pop()!
  return {
    ...state,
    board,
    history,
    moveCount: state.moveCount - 1,
    lastPlayer: null,
    lastReply: null,
    message: '已悔棋一步',
  }
}

/** 提示结果：消耗一次配额并给出白方参考走法。 */
export interface HintResult { state: ChessEndState, move: ChessMove | null, label: string }

/**
 * 请求一步参考走法（白 2 层 + 黑 1 层搜索），配额 3 次；用尽或对局结束
 * 返回 move 为 null 且状态不变。
 * @param state - 当前状态。
 */
export function requestHint(state: ChessEndState): HintResult {
  if (state.status !== 'playing' || state.hintsLeft <= 0) return { state, move: null, label: '' }
  const result = searchWhite(state.board)
  if (result.move === null) return { state, move: null, label: '' }
  return {
    state: { ...state, hintsLeft: state.hintsLeft - 1 },
    move: result.move,
    label: moveLabel(state.board, result.move),
  }
}
