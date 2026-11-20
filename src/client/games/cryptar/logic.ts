/**
 * 密码算式（Cryptarithm / Alphametic）纯逻辑：内置题库（预跑求解器验证唯一解），
 * 映射合法性、进位链逐位验算（只报冲突不剧透）、提示、计分与 seed 选关，
 * 全部为纯函数/纯数据，渲染与交互在 render.ts / index.ts。
 */

/** 一道竖式加法谜题：addends 各数位之和等于 result。 */
export interface CryptarPuzzle {
  /** 稳定 id（题面字符串）。 */
  id: string
  /** 加数（大写英文单词），1 个以上。 */
  addends: string[]
  /** 和（大写英文单词）。 */
  result: string
  /** 出现过的字母（首次出现序）。 */
  letters: string[]
  /** 出现在某词首位的字母集合（映射不可为 0）。 */
  leading: string[]
  /** 难度档（1 最易，5 最难），planPuzzles 按档递进取题。 */
  tier: number
  /** 唯一解（构建期求解器验证过），提示系统据此揭示。 */
  solution: Readonly<Record<string, number>>
}

/** 部分字母→数字映射（未填的字母无键）。 */
export type DigitMap = Record<string, number>

/** mulberry32 确定性伪随机数发生器：同 seed 同序列，可测。 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return (): number => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 求解字母算式：返回唯一解；无解或解不唯一返回 null。
 * @param addends - 加数单词。
 * @param result - 和单词。
 * @param maxSolutions - 内部剪枝上限（默认 2，够判唯一）。
 * @returns 唯一解映射，或 null。
 */
export function solveAlphametic(
  addends: string[],
  result: string,
  maxSolutions = 2,
): DigitMap | null {
  const words = [...addends, result]
  const cols = Math.max(...words.map(w => w.length))
  const revAddends = addends.map(w => [...w].reverse().join(''))
  const revResult = [...result].reverse().join('')
  // 字母按首次出现的列（个位优先）排序：早列早定型，配合逐列剪枝极大收敛。
  const letters = [...new Set(words.join(''))].sort((a, b) => {
    const colOf = (ch: string): number => {
      for (let c = 0; c < cols; c += 1) {
        for (const w of words) {
          if (w[w.length - 1 - c] === ch) return c
        }
      }
      return cols
    }
    return colOf(a) - colOf(b)
  })
  const leadingSet = new Set(words.map(w => w[0]))
  const solutions: DigitMap[] = []
  const assign: DigitMap = {}
  const used = new Array<boolean>(10).fill(false)
  // 每列字母集合（加数与结果），用于“整列已定型”剪枝。
  const colLetters: string[][] = []
  for (let c = 0; c < cols; c += 1) {
    const set = new Set<string>()
    for (const w of words) {
      const ch = w[w.length - 1 - c]
      if (ch !== undefined) set.add(ch)
    }
    colLetters.push([...set])
  }
  const maxCarry = addends.length
  /** 已全部定型的列在某个进位下末位必须能对上（若结果字母也已定型）。 */
  const columnPossible = (done: Set<string>): boolean => {
    for (let c = 0; c < cols; c += 1) {
      const ls = colLetters[c]!
      if (!ls.every(l => done.has(l))) continue
      let sum = 0
      for (let i = 0; i < addends.length; i += 1) {
        const ch = revAddends[i]![c]
        if (ch !== undefined) sum += assign[ch]!
      }
      const want = assign[revResult[c]!]!
      let ok = false
      for (let carry = 0; carry <= maxCarry; carry += 1) {
        if ((sum + carry) % 10 === want) { ok = true; break }
      }
      if (!ok) return false
    }
    return true
  }
  const rec = (li: number, done: Set<string>): void => {
    if (solutions.length >= maxSolutions) return
    if (li === letters.length) {
      let carry = 0
      for (let c = 0; c < cols; c += 1) {
        let sum = carry
        for (let i = 0; i < revAddends.length; i += 1) {
          const ch = revAddends[i]![c]
          if (ch !== undefined) sum += assign[ch]!
        }
        const rch = revResult[c]
        if (rch === undefined) {
          if (sum !== 0) return
        } else if (sum % 10 !== assign[rch]) return
        carry = Math.floor(sum / 10)
      }
      if (carry !== 0) return
      solutions.push({ ...assign })
      return
    }
    const letter = letters[li]!
    for (let d = 0; d <= 9; d += 1) {
      if (used[d]) continue
      if (d === 0 && leadingSet.has(letter)) continue
      assign[letter] = d
      used[d] = true
      done.add(letter)
      if (columnPossible(done)) rec(li + 1, done)
      done.delete(letter)
      used[d] = false
      delete assign[letter]
      if (solutions.length >= maxSolutions) return
    }
  }
  rec(0, new Set<string>())
  return solutions.length === 1 ? solutions[0]! : null
}

/** 由单词组构造谜题（含唯一解求解；解不唯一抛错，构建期即暴露）。 */
function makePuzzle(addends: string[], result: string, tier: number): CryptarPuzzle {
  const solution = solveAlphametic(addends, result)
  if (solution === null) {
    throw new Error('cryptar puzzle must have a unique solution: ' + addends.join(' + ') + ' = ' + result)
  }
  const words = [...addends, result]
  return {
    id: addends.join(' + ') + ' = ' + result,
    addends,
    result,
    letters: [...new Set(words.join(''))],
    leading: [...new Set(words.map(w => w.charAt(0)))],
    tier,
    solution,
  }
}

/** 内置题库：8 道经典题，难度递进，全部预验证唯一解。 */
export const PUZZLES: readonly CryptarPuzzle[] = [
  makePuzzle(['NO', 'NO'], 'TOO', 1),
  makePuzzle(['SEND', 'MORE'], 'MONEY', 2),
  makePuzzle(['BASE', 'BALL'], 'GAMES', 2),
  makePuzzle(['SATURN', 'URANUS'], 'PLANETS', 3),
  makePuzzle(['CROSS', 'ROADS'], 'DANGER', 3),
  makePuzzle(['DONALD', 'GERALD'], 'ROBERT', 4),
  makePuzzle(['FORTY', 'TEN', 'TEN'], 'SIXTY', 4),
  makePuzzle(['FIFTY', 'STATES'], 'AMERICA', 5),
]

export const TOTAL_LEVELS = 5

/**
 * 按难度档递进选 5 道题：每个难度档（1..5）内用 seed 伪随机取一道，
 * 既保证难度递增，又让不同 seed 的对局题面不同。
 * @param seed - 对局种子。
 * @returns 长度为 5 的题面序列（难度递增）。
 */
export function planPuzzles(seed: number): CryptarPuzzle[] {
  const rand = mulberry32(seed)
  const plan: CryptarPuzzle[] = []
  for (let tier = 1; tier <= TOTAL_LEVELS; tier += 1) {
    const pool = PUZZLES.filter(p => p.tier === tier)
    plan.push(pool[Math.floor(rand() * pool.length)]!)
  }
  return plan
}

/** 逐位验算结果：只报冲突（红显），不剧透任何未填答案。 */
export interface CheckResult {
  /** 任一列冲突（含重复数字/首字母为 0）。 */
  conflict: boolean
  /** 每列（从右往左，0 = 个位）是否有冲突。 */
  columns: boolean[]
  /** 不同字母被映射到同一数字。 */
  duplicateDigits: boolean
  /** 已映射的首字母为 0。 */
  leadingZero: boolean
  /** 所有字母均已映射。 */
  complete: boolean
  /** 全部映射完成且算式成立。 */
  solved: boolean
}

/**
 * 验算当前部分映射：未填字母视为自由数字（0-9），用进位链可达性判断
 * 每一列在当前已填数字下是否仍可能成立——不可能则该列标冲突；
 * 该判定只会漏报不会误报（自由字母忽略互异性是放宽，不是收紧）。
 * @param puzzle - 谜题。
 * @param map - 部分映射。
 * @returns 逐列冲突与过关判定。
 */
export function checkMapping(puzzle: CryptarPuzzle, map: DigitMap): CheckResult {
  const words = [...puzzle.addends, puzzle.result]
  const cols = Math.max(...words.map(w => w.length))
  const columns = new Array<boolean>(cols).fill(false)

  // 一一映射与首字母非零：冲突标记到含该字母的列。
  const dupLetters = new Set<string>()
  const seen = new Map<number, string>()
  for (const letter of puzzle.letters) {
    const d = map[letter]
    if (d === undefined) continue
    const prev = seen.get(d)
    if (prev !== undefined) {
      dupLetters.add(prev)
      dupLetters.add(letter)
    } else {
      seen.set(d, letter)
    }
  }
  const zeroLeading = new Set<string>()
  for (const letter of puzzle.leading) {
    if (map[letter] === 0) zeroLeading.add(letter)
  }
  const badLetters = (c: number): boolean =>
    words.some(w => {
      const ch = w[w.length - 1 - c]
      return ch !== undefined && (dupLetters.has(ch) || zeroLeading.has(ch))
    })

  // 进位链 DP：每列维护可达的 (carryIn -> carryOut) 对；未填字母按
  // 各自 0-9 自由取值（同列同字母取同一值），计算该列可能的取值区间。
  const pairs: Array<Map<number, Set<number>>> = []
  let current = new Set<number>([0])
  for (let c = 0; c < cols; c += 1) {
    const pairMap = new Map<number, Set<number>>()
    pairs.push(pairMap)
    const next = new Set<number>()
    for (const carry of current) {
      const outs = pairMap.get(carry) ?? new Set<number>()
      pairMap.set(carry, outs)
      // 每个未知字母自由取值时列和的取值集合（已填字母固定）。
      let sums = [carry]
      // 本列每个自由字母的出现次数 k：贡献 k*v（v 自由取 0-9），已填字母固定贡献。
      const freeCount = new Map<string, number>()
      for (let i = 0; i < puzzle.addends.length; i += 1) {
        const ch = puzzle.addends[i]![puzzle.addends[i]!.length - 1 - c]
        if (ch === undefined) continue
        if (map[ch] !== undefined) {
          sums = sums.map(s => s + map[ch]!)
        } else {
          freeCount.set(ch, (freeCount.get(ch) ?? 0) + 1)
        }
      }
      for (const [ch, k] of freeCount) {
        sums = sums.flatMap(s => {
          const out: number[] = []
          for (let v = 0; v <= 9; v += 1) out.push(s + k * v)
          return out
        })
      }
      const rch = puzzle.result[puzzle.result.length - 1 - c]
      if (rch === undefined) {
        for (const s of sums) if (s === 0) outs.add(0)
      } else if (map[rch] !== undefined) {
        const want = map[rch]!
        for (const s of sums) if (s % 10 === want) outs.add(Math.floor(s / 10))
      } else {
        // 结果字母未填：任何列和都有某个末位可匹配（自由），不收窄。
        for (const s of sums) outs.add(Math.floor(s / 10))
      }
    }
    for (const outs of pairMap.values()) for (const o of outs) next.add(o)
    current = next
  }
  // 反向过滤：okIn[c] 为进入第 c 列且之后（含最终进位 0）都能成立的进位集合；
  // 为空 <=> 该列在当前映射下不可能成立 => 红显。
  const okAfter: Array<Set<number>> = new Array(cols + 1)
  okAfter[cols] = new Set<number>([0])
  const okIn: Array<Set<number>> = new Array(cols)
  for (let c = cols - 1; c >= 0; c -= 1) {
    const ok = new Set<number>()
    for (const [cin, outs] of pairs[c]!) {
      for (const o of outs) {
        if (okAfter[c + 1]!.has(o)) {
          ok.add(cin)
          break
        }
      }
    }
    okIn[c] = ok
    okAfter[c] = ok
  }
  for (let c = 0; c < cols; c += 1) {
    columns[c] = okIn[c]!.size === 0 || badLetters(c)
  }

  const complete = puzzle.letters.every(l => map[l] !== undefined)
  const conflict = columns.some(x => x)
  let solved = false
  if (complete && !conflict) {
    let carry = 0
    let ok = true
    for (let c = 0; c < cols && ok; c += 1) {
      let sum = carry
      for (const w of puzzle.addends) {
        const ch = w[w.length - 1 - c]
        if (ch !== undefined) sum += map[ch]!
      }
      const rch = puzzle.result[puzzle.result.length - 1 - c]
      if (rch === undefined) {
        if (sum !== 0) ok = false
      } else if (sum % 10 !== map[rch]) ok = false
      carry = Math.floor(sum / 10)
    }
    if (carry !== 0) ok = false
    solved = ok
  }
  return {
    conflict,
    columns,
    duplicateDigits: dupLetters.size > 0,
    leadingZero: zeroLeading.size > 0,
    complete,
    solved,
  }
}

/** 单关运行时状态（纯数据，操作函数返回新对象）。 */
export interface LevelState {
  mapping: DigitMap
  hintsUsed: number
  /** 提示揭示的字母（渲染高亮，区别于玩家自填）。 */
  revealed: string[]
  solved: boolean
}

export function createLevelState(): LevelState {
  return { mapping: {}, hintsUsed: 0, revealed: [], solved: false }
}

/**
 * 给字母填数字：若该数字已被其它字母占用，旧字母自动让出（保持一一映射）。
 * @returns 新状态。
 */
export function assignDigit(state: LevelState, letter: string, digit: number): LevelState {
  if (digit < 0 || digit > 9) return state
  const mapping: DigitMap = {}
  for (const [l, d] of Object.entries(state.mapping)) {
    if (d === digit) continue
    mapping[l] = d
  }
  mapping[letter] = digit
  return { ...state, mapping }
}

/** 清除某字母的映射。 */
export function clearLetter(state: LevelState, letter: string): LevelState {
  if (state.mapping[letter] === undefined) return state
  const mapping: DigitMap = {}
  for (const [l, d] of Object.entries(state.mapping)) {
    if (l !== letter) mapping[l] = d
  }
  return { ...state, mapping }
}

/**
 * 使用一次提示：按 letters 顺序揭示第一个未映射字母的答案（确定性），
 * 每关最多 2 次；揭示的字母计分时扣分。
 * @returns [新状态, 揭示的字母]；无提示额度或已填满时返回 null。
 */
export function applyHint(state: LevelState, puzzle: CryptarPuzzle): [LevelState, string] | null {
  if (state.hintsUsed >= 2) return null
  const target = puzzle.letters.find(l => state.mapping[l] === undefined)
  if (target === undefined) return null
  const next = assignDigit(state, target, puzzle.solution[target]!)
  return [{ ...next, hintsUsed: state.hintsUsed + 1, revealed: [...state.revealed, target] }, target]
}

export const HINT_PENALTY = 60

/**
 * 单关计分：基础分（随关卡递增）+ 用时奖励（每秒 -4，下限 0）− 提示罚分，最低 40。
 * @param levelIdx - 0 起关卡下标。
 * @param elapsedMs - 本关用时（毫秒）。
 * @param hintsUsed - 本关提示次数。
 */
export function scoreFor(levelIdx: number, elapsedMs: number, hintsUsed: number): number {
  const base = 200 + levelIdx * 100
  const timeBonus = Math.max(0, 300 - Math.floor(elapsedMs / 1000) * 4)
  return Math.max(40, base + timeBonus - hintsUsed * HINT_PENALTY)
}

/**
 * 数值化题面：按映射把每个词转成数字串（未填字母用 '?')，过关 overlay 用。
 */
export function numericWords(puzzle: CryptarPuzzle, map: DigitMap): string[] {
  const one = (w: string): string =>
    [...w].map(ch => (map[ch] === undefined ? '?' : String(map[ch]))).join('')
  return [...puzzle.addends.map(one), one(puzzle.result)]
}
