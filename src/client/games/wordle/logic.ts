/**
 * Wordle 纯逻辑：判绿/黄/灰（含重复字母的正确消耗）、键盘提示合并、
 * 猜测合法性（任意等长纯字母词）、mulberry32 种子随机选词。全部为确定性纯函数。
 */
import { ANSWERS_4, ANSWERS_5, ANSWERS_6 } from './words.ts'

/** 单个字母的判定：green 位置正确，yellow 字母存在位置不对，gray 不存在。 */
export type LetterVerdict = 'green' | 'yellow' | 'gray'

/** 键盘提示表：字母 → 最强判定。 */
export type KeyHints = Record<string, LetterVerdict>

/** 各词长对应的候选答案池。 */
export const ANSWERS_BY_LEN: Record<number, readonly string[]> = {
  4: ANSWERS_4,
  5: ANSWERS_5,
  6: ANSWERS_6,
}

/** mulberry32 种子随机数发生器（确定性，[0, 1)）。 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 标准 Wordle 判定：先标绿并消耗对应答案字母，非绿位再按剩余计数标黄；
 * 每个答案字母至多被消耗一次，重复字母不会多标黄。
 * @param guess - 大写字母的猜测词。
 * @param answer - 与 guess 等长的答案。
 * @returns 与 guess 逐位对应的判定。
 */
export function judge(guess: string, answer: string): LetterVerdict[] {
  const n = guess.length
  const verdicts: LetterVerdict[] = new Array(n).fill('gray')
  const remaining = new Map<string, number>()
  for (let i = 0; i < n; i += 1) {
    if (guess[i] === answer[i]) {
      verdicts[i] = 'green'
    } else {
      const a = answer[i]!
      remaining.set(a, (remaining.get(a) ?? 0) + 1)
    }
  }
  for (let i = 0; i < n; i += 1) {
    if (verdicts[i] === 'green') continue
    const g = guess[i]!
    const left = remaining.get(g) ?? 0
    if (left > 0) {
      verdicts[i] = 'yellow'
      remaining.set(g, left - 1)
    }
  }
  return verdicts
}

/** 判定强度：green > yellow > gray。 */
const VERDICT_RANK: Record<LetterVerdict, number> = { gray: 1, yellow: 2, green: 3 }

/**
 * 将一次猜测的判定合并进键盘提示：只升级、不降级（green 最强）。
 * @param prev - 现有键盘提示。
 * @param guess - 刚提交的猜测词（与 verdicts 逐位对应）。
 * @param verdicts - judge 对该猜测的判定。
 * @returns 新提示表；不修改 prev。
 */
export function mergeKeyHints(prev: KeyHints, guess: string, verdicts: readonly LetterVerdict[]): KeyHints {
  const next: KeyHints = { ...prev }
  for (let i = 0; i < verdicts.length && i < guess.length; i += 1) {
    const letter = guess[i]!
    const verdict = verdicts[i]!
    const cur = next[letter]
    if (cur === undefined || VERDICT_RANK[verdict] > VERDICT_RANK[cur]) next[letter] = verdict
  }
  return next
}

/**
 * 猜测是否合法：恰好 len 个大写字母 A–Z，不要求在词表内。
 * @param w - 待检查的词。
 * @param len - 本关的词长。
 */
export function isValidGuess(w: string, len: number): boolean {
  return new RegExp(`^[A-Z]{${len}}$`).test(w)
}

/**
 * 用种子确定性选一个指定词长的答案。
 * @param seed - 整数种子（同种子同词）。
 * @param len - 词长（4 / 5 / 6）。
 * @returns 对应词表中的一个答案。
 */
export function pickAnswer(seed: number, len: number): string {
  const answers = ANSWERS_BY_LEN[len] ?? ANSWERS_5
  const rng = mulberry32(seed)
  return answers[Math.floor(rng() * answers.length)]!
}
