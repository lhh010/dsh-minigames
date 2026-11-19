/**
 * 诺诺旋转（NonogramSpin）纯逻辑：标准非ograms 盘面 + 旋转 twist。每执行一次
 * 校验（未通过时）盘面顺时针旋转 90°——玩家已填的格子跟着转，而线索按旋转后
 * 的行列重新对应（玩家需在脑内旋转线索推理）。图案由注入 seed 的 mulberry32
 * 生成：先布图案，再推导四向轮转的线索。全部纯函数，确定性可测。
 */
/** 玩家格子标记：0 空 / 1 填黑 / 2 打叉（叉不参与对错判定，仅辅助排除）。 */
export type Cell = 0 | 1 | 2;
/** 行列线索：连续黑段长度；空线为 [0]。 */
export interface Clues {
    rows: number[][];
    cols: number[][];
}
/** 关卡盘面边长：5 关从 5x5 递增到 10x10。 */
export declare const LEVEL_SIZES: readonly number[];
/** 每关可用的校验（旋转）次数：后期更紧。 */
export declare const LEVEL_CHECKS: readonly number[];
/** 关卡总数。 */
export declare const LEVEL_COUNT: number;
/** mulberry32 PRNG：小而快，同 seed 严格同序列。 */
export declare function mulberry32(seed: number): () => number;
/** 一行（布尔线）的线索：连续 true 段长度；全空返回 [0]。 */
export declare function lineClue(line: boolean[]): number[];
/** 由方阵图案推导原始朝向（未旋转）的行列线索。 */
export declare function cluesFrom(pattern: boolean[][]): Clues;
/** 方阵顺时针旋转 90°：dst[r][c] = src[n-1-c][r]。 */
export declare function rotateGridCW<T>(grid: T[][]): T[][];
/**
 * 线索随盘面顺时针旋转：新行 r 的线索来自原列 r 自下而上（线索段顺序反转），
 * 新列 c 的线索来自原行 n-1-c（顺序不变）。恒等于 cluesFrom(rotateGridCW(pattern))。
 */
export declare function rotateCluesCW(clues: Clues): Clues;
/**
 * 由 seed 确定性地生成一关图案：约 40–65% 密度的随机盘面，拒绝全空与全满
 * （无解或无趣），必要时重roll（PRNG 继续推进，序列仍确定）。
 * @param seed - 本关种子（建议由 levelSeed 派生）。
 * @param size - 盘面边长。
 * @returns size x size 布尔方阵，必含至少一个 true 与一个 false。
 */
export declare function makePattern(seed: number, size: number): boolean[][];
/**
 * 关卡种子派生：同一总局 seed 在同一关卡恒得到同一图案（seed 重放可测）。
 * @param seed - 总局种子。
 * @param level - 0 起关卡序号。
 */
export declare function levelSeed(seed: number, level: number): number;
/** 当前盘面与图案的错格数：填黑不等于图案即错；空格与叉都算未填。 */
export declare function countErrors(cells: Cell[][], pattern: boolean[][]): number;
/** 过关判定：错格数为 0（填黑与图案完全一致）。 */
export declare function isSolved(cells: Cell[][], pattern: boolean[][]): boolean;
/** 游戏阶段：进行中 / 过关 / 校验次数耗尽失败。 */
export type Phase = 'playing' | 'won' | 'failed';
/** 一局的完整可变状态（logic 直接改写，render 只读）。 */
export interface NonospinState {
    /** 总局种子。 */
    seed: number;
    /** 0 起关卡序号。 */
    level: number;
    /** 本关盘面边长。 */
    size: number;
    /** 剩余校验次数。 */
    checksLeft: number;
    /** 校验总次数（HUD 展示）。 */
    checksTotal: number;
    /** 累计旋转次数 mod 4（指南针朝向）。 */
    rotation: 0 | 1 | 2 | 3;
    /** 目标图案（原始朝向，永不旋转）。 */
    pattern: boolean[][];
    /** 玩家标记（当前朝向；旋转时整阵轮转）。 */
    cells: Cell[][];
    /** 原始朝向线索（派生自 pattern）。 */
    clues: Clues;
    /** 最近一次校验的错格数（null = 尚未校验）。 */
    lastErrors: number | null;
    /** 当前阶段。 */
    phase: Phase;
}
/** 建立某一关的初始状态。 */
export declare function createLevelState(seed: number, level: number): NonospinState;
/** 建立第 0 关状态。 */
export declare function createNonospinState(seed: number): NonospinState;
/** 就地重置当前关（保留关卡进度与种子）。 */
export declare function restartLevel(state: NonospinState): void;
/**
 * 设置一格标记（越界或非进行中忽略）。填黑/打叉互斥。
 * @param state - 当前状态。
 * @param r - 行（当前朝向坐标）。
 * @param c - 列（当前朝向坐标）。
 * @param value - 目标标记。
 */
export declare function setCell(state: NonospinState, r: number, c: number, value: Cell): void;
/** 校验结果：错格数、是否过关、本次是否触发了旋转。 */
export interface CheckResult {
    errors: number;
    won: boolean;
    rotated: boolean;
}
/**
 * 执行一次校验（空格键）：统计当前错格数（不指出位置）。全对过关不旋转；
 * 有错则消耗一次校验并顺时针旋转盘面（玩家格子整阵轮转），次数耗尽即失败。
 * 非进行中调用是无害空操作（返回当前错格数）。
 */
export declare function checkBoard(state: NonospinState): CheckResult;
/**
 * 当前朝向应显示的线索：把原始线索顺时针轮转 rotation 次。
 * 恒等于 cluesFrom(rotateGridCW 应用 rotation 次后的 pattern)。
 */
export declare function displayClues(state: NonospinState): Clues;
/**
 * 过关得分：基础 100 + 剩余校验奖励（每次 25）− 旋转惩罚（每次 5，下限 0）。
 * @param checksLeft - 过关时剩余校验次数。
 * @param rotations - 本关累计旋转次数。
 */
export declare function levelScore(checksLeft: number, rotations: number): number;
