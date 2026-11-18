/**
 * 旗帜竞猜纯逻辑：内置 60+ 国旗题库（emoji / 国名 / 大洲 / 冷知识四字段，
 * 预置「北欧十字组」「竖三色组」等易混组），两种题型轮换——看旗选国名 /
 * 看国名选旗；干扰项优先同组、其次同洲。每题 10 秒倒计时，答对得分
 * 剩秒×10 加连击加成；答错不扣分但记入错题。10 题一节、3 节挑战，节末
 * 错题回顾。所有随机走注入 seed（mulberry32），同一 seed 重放完全一致；
 * 逻辑层无 DOM、无定时器，时间由调用方以 dt 推进。
 */
/** 每节题数。 */
export declare const QUESTIONS_PER_ROUND = 10;
/** 总节数。 */
export declare const TOTAL_ROUNDS = 3;
/** 每题作答限时（毫秒）。 */
export declare const QUESTION_TIME_MS = 10000;
/** 每题选项数（4 选 1）。 */
export declare const OPTION_COUNT = 4;
/** 每层连击追加的分（答对时加 combo × COMBO_BONUS）。 */
export declare const COMBO_BONUS = 5;
/** 大洲分类。 */
export type Continent = '亚洲' | '欧洲' | '非洲' | '美洲' | '大洋洲';
/**
 * 题库条目：emoji 旗帜、中文国名、所属大洲、一句话冷知识；group 为
 * 预置易混组（'cross' 北欧十字/瑞士十字旗，'tricolor' 竖三色旗），
 * 干扰项抽取时优先同组。
 */
export interface FlagEntry {
    emoji: string;
    name: string;
    continent: Continent;
    fact: string;
    group?: string;
}
/** 国旗题库（66 面，覆盖五大洲）。 */
export declare const FLAG_BANK: FlagEntry[];
/** 题型：看旗选国名 / 看国名选旗。 */
export type QuestionKind = 'flag-to-name' | 'name-to-flag';
/** 一道题：题型、题面与选项的题库下标（含正确答案）、答案位次。 */
export interface FlagsQuestion {
    kind: QuestionKind;
    /** 题面（正确答案）的题库下标。 */
    promptIndex: number;
    /** 四个选项的题库下标（随机顺序）。 */
    options: number[];
    /** 正确答案在 options 中的位次（0-3）。 */
    answerPos: number;
}
/** 一条错题：题面下标与玩家所选（null 为超时未答）。 */
export interface WrongRecord {
    promptIndex: number;
    chosenIndex: number | null;
}
export type FlagsPhase = 'question' | 'feedback' | 'review' | 'over';
export interface FlagsState {
    phase: FlagsPhase;
    /** 当前节（0-2）。 */
    round: number;
    /** 节内题号（0 基，范围 [0, QUESTIONS_PER_ROUND)）。 */
    indexInRound: number;
    /** 当前题目。 */
    question: FlagsQuestion;
    /** 剩余作答时间（毫秒），由调用方按 dt 递减。 */
    remainingMs: number;
    score: number;
    /** 当前连续答对次数。 */
    combo: number;
    /** 本局最高连击。 */
    bestCombo: number;
    /** 上一题判定：'correct' | 'wrong'（含超时）| null（尚未作答）。 */
    lastResult: 'correct' | 'wrong' | null;
    /** 全局错题收集（跨节累计，供回顾与结束展示）。 */
    wrongs: WrongRecord[];
    /** 已出过题的题库下标（避免一局内重复出题）。 */
    used: number[];
    rng: () => number;
}
/**
 * mulberry32 确定性随机：同一 seed 生成同一序列。
 * @param seed - 32 位无符号整数种子。
 * @returns 返回 [0, 1) 随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/**
 * 答对一题的得分：剩余秒数（向上取整）×10，再加 combo × COMBO_BONUS。
 * @param remainingMs - 作答时剩余毫秒。
 * @param combo - 本次作答前的连击数。
 * @returns 应加的分数。
 */
export declare function scoreFor(remainingMs: number, combo: number): number;
/**
 * 生成一道题：题型按全局题号奇偶轮换；题面从未用条目中抽取；干扰项
 * 优先同易混组（组内不足 3 个时退回同洲），仍不足再从其余条目补齐。
 * @param rng - 随机源。
 * @param questionNumber - 全局 0 基题号（决定题型轮换）。
 * @param used - 已出过题的题库下标（本题题面会从中排除）。
 * @returns 生成的题目（不修改 used，由调用方登记）。
 */
export declare function generateQuestion(rng: () => number, questionNumber: number, used: number[]): FlagsQuestion;
/**
 * 建立初始状态并发出第一题。
 * @param rng - 注入的 [0,1) 随机源（默认 Math.random；测试请注入 mulberry32）。
 * @returns 就绪的 FlagsState（phase 为 'question'）。
 */
export declare function createFlagsState(rng?: () => number): FlagsState;
/**
 * 选择选项作答。答对：得分（剩秒×10 + 连击加成）、连击 +1；答错：清
 * 连击、记入错题（不扣分）。两种结果都进入 'feedback' 展示知识卡。
 * @param state - 当前状态（须处于 'question'）。
 * @param optionPos - 选项位次 0-3。
 * @returns 'ignored' 非答题阶段或位次越界；'correct' 答对；'wrong' 答错。
 */
export declare function answer(state: FlagsState, optionPos: number): 'ignored' | 'correct' | 'wrong';
/**
 * 推进剩余作答时间；时间耗尽视为超时：清连击、记入错题（chosen 为
 * null）、进入 'feedback'。
 * @param state - 当前状态。
 * @param dtMs - 本帧流逝的毫秒数（非负）。
 * @returns 'ok' 继续作答；'timeout' 本题超时。
 */
export declare function tick(state: FlagsState, dtMs: number): 'ok' | 'timeout';
/**
 * 进入下一题 / 下一节：'feedback' 时若节未满则发下一题，否则转入
 * 'review'；'review' 时若节未打完则开新节，否则 'over' 结束。
 * @param state - 当前状态。
 * @returns 'ignored' 无可推进的阶段；'question' 进入新题；'review' 进入
 * 节末回顾；'over' 全部结束。
 */
export declare function next(state: FlagsState): 'ignored' | 'question' | 'review' | 'over';
