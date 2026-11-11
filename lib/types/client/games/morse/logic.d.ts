/**
 * 摩斯电码纯逻辑：36 字符摩斯表、单词展开为点/划灯光信号、按键时长
 * 分桶（点 <180ms、划 ≥180ms）、解码选词（注入 rng 种子）、计分与
 * 关卡推进（词长 2→5，先常见字母后全集）。全部为纯函数 + 普通状态
 * 对象，不含 DOM 与定时器；随机一律来自注入的 rng，保证确定性可测。
 */
/** 36 字符摩斯表：A-Z 与 0-9 的标准电码（'.' 点，'-' 划）。 */
export declare const MORSE_TABLE: Readonly<Record<string, string>>;
/** 点的播放时长（ms）。 */
export declare const DIT_MS = 180;
/** 划的播放时长（ms）。 */
export declare const DAH_MS = 540;
/** 点/划分桶阈值：按压时长 <180ms 记点，≥180ms 记划。 */
export declare const ELEMENT_THRESHOLD_MS = 360;
/** 字母内点划之间的熄灭间隔（ms）。 */
export declare const SYMBOL_GAP_MS = 180;
/** 播放时字母之间的空隙（ms）。 */
export declare const LETTER_GAP_MS = 700;
/** 编码判定容差 ±25%：抬键后的停顿达到该时长的 75% 即判定字母结束。 */
export declare const TOLERANCE = 0.25;
/** 字母结束判定阈值：LETTER_GAP_MS * (1 - TOLERANCE) = 375ms。 */
export declare const LETTER_END_GAP_MS: number;
/** 最长电码长度（数字 5 个符号），超过即拒绝继续累计。 */
export declare const MAX_CODE_LEN = 5;
/** 初始生命。 */
export declare const START_LIVES = 3;
/** mulberry32 确定性伪随机：同一种子产出同一 0..1 序列。
 * @param seed - 32 位种子。
 * @returns 返回 0..1（含 0 不含 1）的随机函数。
 */
export declare function mulberry32(seed: number): () => number;
/** 单元信号：亮（on=true）或灭，持续 ms 毫秒。 */
export interface MorseSignal {
    on: boolean;
    ms: number;
}
/**
 * 把一个单词展开为灯光信号序列：点 120ms、划 300ms，字母内符号间灭
 * 120ms，字母间灭 500ms。
 * @param word - 由 A-Z/0-9 组成的目标词。
 * @returns 信号数组；不认识的字符直接跳过。
 */
export declare function expandWord(word: string): MorseSignal[];
/**
 * 信号序列总时长（ms）。
 * @param schedule - expandWord 产出的信号数组。
 */
export declare function totalDurationMs(schedule: readonly MorseSignal[]): number;
/**
 * 播放进度到 tMs 时指示灯是否点亮（超出末尾恒为灭）。
 * @param schedule - 信号数组。
 * @param tMs - 自播放起的毫秒数。
 */
export declare function signalAt(schedule: readonly MorseSignal[], tMs: number): boolean;
/**
 * 按压时长分桶：<180ms 记点，≥180ms 记划。
 * @param ms - 按压持续毫秒数。
 * @returns '.' 或 '-'。
 */
export declare function classifyElementDuration(ms: number): '.' | '-';
/**
 * 抬键后的停顿是否足以判定当前字母输入结束（500ms 的 75%，即 375ms）。
 * @param gapMs - 停顿毫秒数。
 */
export declare function gapEndsLetter(gapMs: number): boolean;
/**
 * 电码反查字符。
 * @param code - 只含 '.' 与 '-' 的电码。
 * @returns 对应字符，查无此码返回 null。
 */
export declare function letterFromCode(code: string): string | null;
/** 关卡配置：词长、字符集、默认是否显示对照表、每关轮数。 */
export interface MorseLevelConfig {
    wordLength: number;
    alphabet: string;
    hintDefault: boolean;
    rounds: number;
}
/** 5 关递进：词长 2→5，常见字母→全集（末关含数字），后期默认关对照表。 */
export declare const LEVELS: readonly MorseLevelConfig[];
export type MorsePhase = 'ready' | 'playback' | 'answer' | 'encode' | 'over' | 'won';
export type MorseMode = 'decode' | 'encode';
/** 摩斯电码游戏状态（纯数据，随逻辑函数变更）。 */
export interface MorseState {
    phase: MorsePhase;
    mode: MorseMode;
    /** 0 基关卡序号（0..4）。 */
    level: number;
    /** 本关已完成的轮数。 */
    roundInLevel: number;
    lives: number;
    score: number;
    /** 本轮目标词。 */
    word: string;
    /** 解码模式已答对的字母数（槽位进度）。 */
    filled: number;
    /** 编码模式已发对的字母下标。 */
    encodeIndex: number;
    /** 编码模式当前字母累计的电码（'.'/'-' 串）。 */
    encodeBuffer: string;
    /** 解码播放用的信号序列。 */
    schedule: MorseSignal[];
    rng: () => number;
}
/**
 * 创建初始状态（phase='ready'，等待 startRound 开局）。
 * @param rng - 注入的 0..1 随机函数（建议 mulberry32(seed)）。
 */
export declare function createMorseState(rng?: () => number): MorseState;
/**
 * 开始一轮：按 rng 从本关词池选词并掷解码/编码模式；解码进入 playback，
 * 编码进入 encode。
 * @param state - 游戏状态（phase 应为 'ready'）。
 */
export declare function startRound(state: MorseState): void;
/**
 * 解码播放结束，进入选字母作答阶段。
 * @param state - 游戏状态。
 * @returns 是否发生了 playback → answer 迁移。
 */
export declare function endPlayback(state: MorseState): boolean;
/**
 * 基础分：关卡越高、词越长越高。
 * @param level - 0 基关卡序号。
 * @param wordLength - 词长。
 */
export declare function baseScore(level: number, wordLength: number): number;
/** 速度奖励窗口基数（ms）。 */
export declare const TIME_BONUS_BASE_MS = 3000;
/** 速度奖励窗口每字母增量（ms）。 */
export declare const TIME_BONUS_MS_PER_LETTER = 1500;
/** 速度奖励步长：窗口内每 300ms 剩余折 1 分。 */
export declare const TIME_BONUS_STEP_MS = 300;
/**
 * 速度奖励：作答越快分越高，超出窗口为 0。
 * @param level - 0 基关卡序号。
 * @param wordLength - 词长。
 * @param elapsedMs - 本轮耗时（ms）。
 */
export declare function speedBonus(level: number, wordLength: number, elapsedMs: number): number;
/**
 * 一轮答对的总得分（基础 + 速度）。
 * @param level - 0 基关卡序号。
 * @param wordLength - 词长。
 * @param elapsedMs - 本轮耗时（ms）。
 */
export declare function answerScore(level: number, wordLength: number, elapsedMs: number): number;
/**
 * 解码模式：从候选键盘选一个字母填槽。
 * @param state - 游戏状态。
 * @param ch - 玩家点击的字符。
 * @param elapsedMs - 本轮耗时（用于计分）。
 * @returns 'ignored' 非作答阶段；'fill' 正确且词未完；'round-clear' 词完
 *   成（已计分并进入 ready/won）；'wrong' 错误（扣命，进度清零重来）。
 */
export declare function pickLetter(state: MorseState, ch: string, elapsedMs: number): 'ignored' | 'fill' | 'wrong' | 'round-clear';
/**
 * 编码模式：记入一次按压（按时长分桶为点或划）。
 * @param state - 游戏状态。
 * @param pressMs - 按压持续毫秒数。
 * @returns 是否被接受（编码阶段且缓冲未满）。
 */
export declare function pushElement(state: MorseState, pressMs: number): boolean;
/**
 * 编码模式：停顿足够长，结算当前字母。
 * @param state - 游戏状态。
 * @param elapsedMs - 本轮耗时（用于计分）。
 * @returns 'ignored' 非编码阶段；'pending' 缓冲为空；'correct' 字母正确
 *   且词未完；'round-clear' 词完成（已计分并进入 ready/won）；'wrong'
 *   电码不符（扣命，重发同一字母）。
 */
export declare function finishEncodeLetter(state: MorseState, elapsedMs: number): 'ignored' | 'pending' | 'correct' | 'wrong' | 'round-clear';
