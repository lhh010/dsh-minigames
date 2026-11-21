/**
 * 找规律 PatternIQ 纯逻辑：序列归纳推理问答。每节 10 题、共 5 节；每题
 * 展示数字序列（等差/等比/斐波那契型/平方数/交错双列/递推）或图形序列
 * （圆点数递增/方框旋转步进/填充交替）的前 4-5 项，4 选 1 选下一项。
 * 限时内越快答对分越高（线性）；答错扣 5 秒可重试，超时或答对后进入
 * 反馈阶段展示规律解释文案；节末回顾本节错题。全部随机走注入 seed
 * （mulberry32），同一 seed 完整重放。
 */
/** mulberry32 PRNG：小而快，按种子确定。 */
export declare function mulberry32(seed: number): () => number;
/** 每节题数。 */
export declare const QUESTIONS_PER_SECTION = 10;
/** 总节数。 */
export declare const SECTIONS = 5;
/** 答错一次扣除的时间（毫秒）。 */
export declare const WRONG_PENALTY_MS = 5000;
/** 答对基础分。 */
export declare const SCORE_BASE = 40;
/** 答对按剩余时间线性追加的最高分。 */
export declare const SCORE_TIME_BONUS = 60;
/** 第 1 节每题限时（毫秒）。 */
export declare const SECTION_TIME_START_MS = 20000;
/** 第 5 节每题限时（毫秒）。 */
export declare const SECTION_TIME_END_MS = 12000;
/** 序列模板种类（graphic 为图形题，见 {@link PatternQuestion.graphicRule}）。 */
export type PatternKind = 'arithmetic' | 'geometric' | 'fibonacci' | 'square' | 'alternating' | 'recursive' | 'graphic';
/** 生成规则参数：p[0]=首项/基数 a，p[1]=公差/公比/系数 b，p[2]=第三参数（交错列第二列首项 / 递推常数）。 */
export interface SequenceRule {
    kind: PatternKind;
    p: readonly number[];
}
/** 图形序列的一格：圆点数、方框旋转角（度）、是否填充。 */
export interface GraphicCell {
    count: number;
    rotation: number;
    filled: boolean;
}
/** 一个选项：数字或图形格。 */
export type PatternOption = {
    kind: 'number';
    value: number;
} | {
    kind: 'cell';
    cell: GraphicCell;
};
/** 图形题的具体规律。 */
export type GraphicRule = 'grow' | 'rotate' | 'alternateFill';
/** 一道生成的找规律题。 */
export interface PatternQuestion {
    /** 难度档 1-4。 */
    level: number;
    /** 数字序列已展示的前 4-5 项（图形题为 null）。 */
    terms: readonly number[] | null;
    /** 图形序列已展示的前 4 格（数字题为 null）。 */
    cells: readonly GraphicCell[] | null;
    /** 图形题规律（数字题为 null）。 */
    graphicRule: GraphicRule | null;
    /** 生成规则参数（校验/解释用；图形题为 kind:'graphic' 占位）。 */
    rule: SequenceRule;
    /** 正确选项。 */
    answer: PatternOption;
    /** 4 个选项（含答案，已乱序）。 */
    options: readonly PatternOption[];
    /** 中文规律解释文案。 */
    explanation: string;
}
/** 本节一条错题记录（题目快照 + 第一次错误选择的展示文本或"超时"）。 */
export interface WrongEntry {
    question: PatternQuestion;
    wrongText: string;
}
/** 局面阶段：作答中 / 反馈（含解释）/ 节末小结 / 全部结束。 */
export type PatterniqPhase = 'question' | 'feedback' | 'summary' | 'end';
/** 可推进的一局状态（可变，由本模块函数推进）。 */
export interface PatterniqState {
    phase: PatterniqPhase;
    /** 1 基节号 1..5。 */
    section: number;
    /** 0 基题号 0..9。 */
    questionIndex: number;
    question: PatternQuestion;
    /** 本题剩余时间（毫秒）。 */
    remainingMs: number;
    /** 本题限时（毫秒）。 */
    timeLimitMs: number;
    score: number;
    /** 反馈阶段已选选项下标（超时为 -1）。 */
    chosenIndex: number;
    /** 最近一次结算结果。 */
    lastOutcome: 'correct' | 'wrong' | 'timeout' | null;
    /** 本题是否已答错过（结算时入错题本用）。 */
    wrongAttempted: boolean;
    wrongText: string;
    /** 本节错题。 */
    sectionWrong: readonly WrongEntry[];
    /** 全场累计答对数 / 作答题数。 */
    totalCorrect: number;
    questionsAsked: number;
    /** 内部随机源（seed 重放用；勿在渲染中消费）。 */
    rng: () => number;
}
/** 各难度档允许的模板池。 */
export declare const LEVEL_KINDS: readonly PatternKind[][];
/** 节号（1 基）→ 难度档 1-4：1/2/3 节为 L1/L2/L3，4-5 节为 L4。 */
export declare function sectionLevel(section: number): number;
/** 节号（1 基）→ 每题限时：第 1 节 20s 线性收紧到第 5 节 12s。 */
export declare function sectionTimeLimit(section: number): number;
/**
 * 按规则计算第 i 项（0 基；i 可超出已展示长度即得答案项）。
 * @param rule - 生成规则。
 * @param i - 0 基下标。
 * @returns 第 i 项的值。
 */
export declare function computeTerm(rule: SequenceRule, i: number): number;
/** 规律解释文案（中文，含具体参数）。 */
export declare function explanationOf(rule: SequenceRule, graphicRule: GraphicRule | null): string;
/** 选项展示文本（数字直接转字符串，图形格描述三属性）。 */
export declare function optionText(option: PatternOption): string;
/**
 * 生成 4 个数字选项：正确答案 + 3 个常见错误干扰项（多走/少走一步、
 * 用错公比/公差、±1 手滑），去重后乱序。
 * @param answerValue - 正确答案。
 * @param rule - 生成规则（决定干扰项形态）。
 * @param rng - 随机源。
 * @returns 4 个选项（含答案）。
 */
export declare function makeNumberOptions(answerValue: number, rule: SequenceRule, rng: () => number, prevTerm?: number): PatternOption[];
/**
 * 由随机源确定性地生成一题。
 * @param rng - 随机源（每次调用推进，同 seed 同题目序列）。
 * @param level - 难度档 1-4。
 * @returns 生成的题目。
 */
export declare function generateQuestion(rng: () => number, level: number): PatternQuestion;
/**
 * 生成图形题：圆点数递增 / 方框旋转步进 / 填充交替，展示前 4 格。
 * @param rng - 随机源。
 * @param level - 难度档（入档文案用）。
 * @returns 生成的图形题。
 */
export declare function generateGraphicQuestion(rng: () => number, level: number): PatternQuestion;
/** 答对得分：基础 40 + 剩余时间比例 × 60（线性），两端夹紧。 */
export declare function scoreFor(remainingMs: number, timeLimitMs: number): number;
/**
 * 由种子构造开局（第 1 节第 1 题）。
 * @param seed - 随机种子。
 * @returns 游玩中的初始状态。
 */
export declare function createPatterniqState(seed: number): PatterniqState;
/**
 * 推进限时：作答阶段倒计时，归零即按超时结算并展示解释。
 * @param state - 局面。
 * @param dtMs - 经过的毫秒数。
 */
export declare function tick(state: PatterniqState, dtMs: number): void;
/**
 * 作答：答对按剩余时间线性计分进入反馈；答错扣 5 秒留在本题可重试
 * （扣到 0 直接连带超时结算），第一次错误文本记入错题本。
 * @param state - 局面。
 * @param optionIndex - 选项下标 0-3。
 * @returns 'correct' | 'wrong' | 'idle'（非作答阶段）。
 */
export declare function answer(state: PatterniqState, optionIndex: number): 'correct' | 'wrong' | 'idle';
/**
 * 空格推进：反馈 → 下一题；第 10 题反馈 → 节末小结；小结 → 下一节
 * （第 5 节小结 → 全部结束）。结束阶段为空操作。
 * @param state - 局面。
 */
export declare function nextQuestion(state: PatterniqState): void;
