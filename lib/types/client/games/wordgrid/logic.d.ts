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
export declare const SIZE = 5;
/** 每关错误提交的尝试上限。 */
export declare const MAX_ATTEMPTS = 10;
/** 每关可用的提示次数（逐级揭示）。 */
export declare const MAX_HINTS = 3;
/** 提示最高档：1 长度 → 2 方向 → 3 首字母位置。 */
export declare const MAX_HINT_STAGE = 3;
/**
 * mulberry32 种子随机数发生器：同 seed 产生同一序列，全部随机经它注
 * 入，生成器可复现、可测试。
 * @param seed - 32 位种子。
 * @returns 返回 [0,1) 随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/** 内置词库：72 个常见英文词（大写，长度 4-5——5×5 格内横/竖/斜直线
 * 最多容纳 5 个字母，更长的不可能直线种入，故词长递进取 4→5）。 */
export declare const WORDS: readonly string[];
/** 八个直线方向：下标供线索卡与放置共用。 */
export declare const DIRS: readonly {
    dx: number;
    dy: number;
    label: string;
}[];
/** 关卡配置：目标词数、词长区间、干扰字母来自目标词字母的概率
 * （越低越按字频混入、越难）。 */
export interface WordGridLevelConfig {
    /** 隐藏目标词数量。 */
    readonly words: number;
    /** 词长下限。 */
    readonly lenMin: number;
    /** 词长上限。 */
    readonly lenMax: number;
    /** 干扰字母取自目标词字母池的概率（0..1）。 */
    readonly decoyBias: number;
    /** HUD 关卡标签。 */
    readonly label: string;
}
/** 5 关递进：词数 3→5、词长 4→5、干扰从目标字母为主过渡到英文字频
 * 混淆。 */
export declare const LEVELS: readonly WordGridLevelConfig[];
/** 一个隐藏目标词：词、放置格子序列与方向下标。 */
export interface TargetWord {
    /** 目标词（大写）。 */
    readonly word: string;
    /** 放置格子序号序列（沿方向直线）。 */
    readonly cells: readonly number[];
    /** 方向下标（DIRS 索引）。 */
    readonly dirIdx: number;
    /** 是否已找出。 */
    found: boolean;
}
/** 一局关卡状态（可变：提交与提示原地更新）。 */
export interface WordGridState {
    /** 关卡下标（LEVELS 索引）。 */
    readonly level: number;
    /** 25 格盘面（一维，大写字母；空串为种词期占位，生成完成后必满）。 */
    readonly grid: string[];
    /** 隐藏目标词列表。 */
    readonly targets: readonly TargetWord[];
    /** 剩余尝试次数。 */
    attemptsLeft: number;
    /** 剩余提示次数。 */
    hintBudget: number;
    /** 每词提示档位（0..MAX_HINT_STAGE，与 targets 同长）。 */
    readonly hintStage: number[];
    /** 阶段：进行中 / 过关 / 尝试用尽 / 全部通关。 */
    phase: 'playing' | 'cleared' | 'failed' | 'won';
    /** 累计得分（跨关卡延续）。 */
    score: number;
    /** 本局基础 seed（关卡 seed 由它派生，重放一致）。 */
    readonly seed: number;
}
/** 提交结果分类。 */
export type SubmitKind = 'empty' | 'invalid' | 'already' | 'found' | 'wrong';
/** 一次链提交的结果。 */
export interface SubmitResult {
    /** 结果分类。 */
    readonly kind: SubmitKind;
    /** 拼出的词（空链为空串）。 */
    readonly word: string;
    /** 本次得分增量。 */
    readonly gain: number;
    /** 命中的目标词下标（found 时有效，否则 -1）。 */
    readonly index: number;
}
/** 两格是否相邻（八向切比雪夫距离 1，自身不算）。
 * @param a - 格子序号。
 * @param b - 格子序号。
 * @returns 相邻为 true。 */
export declare function isAdjacent(a: number, b: number): boolean;
/** 链是否合法：非空、无重复格、逐格相邻（含对角）。
 * @param chain - 格子序号序列。
 * @returns 合法为 true。 */
export declare function isValidChain(chain: readonly number[]): boolean;
/** 能否把 cell 追加到链尾（相邻且未在链中）。
 * @param chain - 当前链。
 * @param cell - 待追加格子。
 * @returns 可追加为 true。 */
export declare function canExtend(chain: readonly number[], cell: number): boolean;
/** 拼出链上的词。
 * @param state - 关卡状态。
 * @param chain - 格子序号序列。
 * @returns 依次连接的字母串。 */
export declare function chainWord(state: WordGridState, chain: readonly number[]): string;
/** 生成一关状态：种子词、填干扰、初始化提示与计分。
 * @param level - 关卡下标（LEVELS 索引）。
 * @param seed - 基础 seed（关卡 seed 派生自它，重放一致）。
 * @param carryScore - 上一关带入的累计分。
 * @returns 就绪的可变关卡状态（phase 为 playing）。 */
export declare function createLevelState(level: number, seed: number, carryScore?: number): WordGridState;
/** 提交选词链：按拼出的词判定——是未找出的隐藏词则记分锁定；是已找
 * 出的词不扣罚；否则扣一次尝试（扣尽即失败）。链本身非法（断链/重复
 * 格/空链）不扣罚、只判 invalid。
 * @param state - 关卡状态（原地更新）。
 * @param chain - 格子序号序列。
 * @returns 提交结果。 */
export declare function submitChain(state: WordGridState, chain: readonly number[]): SubmitResult;
/** 使用一次提示：把下一个可提示目标词的线索卡升一档（长度→方向→首
 * 字母位置），消耗一次机会。
 * @param state - 关卡状态（原地更新）。
 * @returns 升档的目标词下标，无机会或无可升档为 -1。 */
export declare function revealHint(state: WordGridState): number;
/** 过关后进入下一关（沿用基础 seed 与累计分）。
 * @param state - 当前状态。
 * @returns cleared 时返回新关状态，否则原样返回。 */
export declare function nextLevelState(state: WordGridState): WordGridState;
/** 首字母位置线索文本（1 起行列）。
 * @param target - 目标词。
 * @returns 如 '第2行第3列'。 */
export declare function startPosText(target: TargetWord): string;
