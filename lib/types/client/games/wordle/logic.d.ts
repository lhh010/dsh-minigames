/** 单个字母的判定：green 位置正确，yellow 字母存在位置不对，gray 不存在。 */
export type LetterVerdict = 'green' | 'yellow' | 'gray';
/** 键盘提示表：字母 → 最强判定。 */
export type KeyHints = Record<string, LetterVerdict>;
/** 各词长对应的候选答案池。 */
export declare const ANSWERS_BY_LEN: Record<number, readonly string[]>;
/** mulberry32 种子随机数发生器（确定性，[0, 1)）。 */
export declare function mulberry32(seed: number): () => number;
/**
 * 标准 Wordle 判定：先标绿并消耗对应答案字母，非绿位再按剩余计数标黄；
 * 每个答案字母至多被消耗一次，重复字母不会多标黄。
 * @param guess - 大写字母的猜测词。
 * @param answer - 与 guess 等长的答案。
 * @returns 与 guess 逐位对应的判定。
 */
export declare function judge(guess: string, answer: string): LetterVerdict[];
/**
 * 将一次猜测的判定合并进键盘提示：只升级、不降级（green 最强）。
 * @param prev - 现有键盘提示。
 * @param guess - 刚提交的猜测词（与 verdicts 逐位对应）。
 * @param verdicts - judge 对该猜测的判定。
 * @returns 新提示表；不修改 prev。
 */
export declare function mergeKeyHints(prev: KeyHints, guess: string, verdicts: readonly LetterVerdict[]): KeyHints;
/**
 * 猜测是否合法：恰好 len 个大写字母 A–Z，不要求在词表内。
 * @param w - 待检查的词。
 * @param len - 本关的词长。
 */
export declare function isValidGuess(w: string, len: number): boolean;
/**
 * 用种子确定性选一个指定词长的答案。
 * @param seed - 整数种子（同种子同词）。
 * @param len - 词长（4 / 5 / 6）。
 * @returns 对应词表中的一个答案。
 */
export declare function pickAnswer(seed: number, len: number): string;
