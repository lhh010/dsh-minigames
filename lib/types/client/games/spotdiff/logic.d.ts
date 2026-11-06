/**
 * 找不同（Spot Diff）纯逻辑：由注入 seed 生成左右两幅几何图案，其中 K 处
 * 形状存在差异（一边缺失 / 颜色不同 / 大小不同）。点击差异位置（容差半径内）
 * 标记一处，全部找齐过关；点错扣时间，倒计时归零失败。全部函数都是确定性的：
 * 相同 seed 与关卡一定得到相同的谜题与判定结果。
 */
/** 几何形状种类。 */
export type ShapeKind = 'circle' | 'square' | 'triangle' | 'star';
/** 棋盘中一个形状（左右两幅图共用同一坐标系）。 */
export interface Shape {
    kind: ShapeKind;
    /** 主题色下标（渲染时映射为 accent 色；颜色差异通过不同下标表达）。 */
    color: number;
    /** 半尺寸（半径 / 半边长），单位为逻辑像素。 */
    size: number;
    /** 面板内中心坐标。 */
    x: number;
    y: number;
}
/** 一处差异的描述与位置。 */
export interface Diff {
    /** 基准形状（左图中的形状，缺失差异时只在一边存在）在形状列表中的下标。 */
    index: number;
    /** 差异类型：missing=一边有一边没有；color=颜色不同；size=大小不同。 */
    kind: 'missing' | 'color' | 'size';
    /** 差异的判定圆心（等于基准形状中心，两侧共用）。 */
    x: number;
    y: number;
}
/** 一关的谜题：左右两幅图案 + 差异列表。 */
export interface Puzzle {
    /** 左图形状列表（基准）。 */
    left: Shape[];
    /** 右图形状列表（应用差异后的变体；missing 差异会少 K_missing 个）。 */
    right: Shape[];
    /** 差异列表。 */
    diffs: Diff[];
    /** 本关点击容差半径（逻辑像素）。 */
    tolerance: number;
}
/** 面板（单侧图案）的逻辑尺寸；两幅图共用同一坐标系。 */
export declare const PANEL_W = 300;
export declare const PANEL_H = 300;
/** 关卡难度递进：形状数 8→16，差异数 5→8，容差收紧。 */
export interface LevelConfig {
    /** 形状总数（左图）。 */
    shapeCount: number;
    /** 差异数。 */
    diffCount: number;
    /** 点击容差半径（px）。 */
    tolerance: number;
}
/** 5 关难度表。 */
export declare const LEVELS: LevelConfig[];
/** 关卡总数。 */
export declare const LEVEL_COUNT: number;
/** 每关初始时间（秒）。 */
export declare const INITIAL_TIME_S = 60;
/** 点错一次的扣时（秒）。 */
export declare const MISS_PENALTY_S = 1;
/** mulberry32 确定性随机数发生器（所有随机都走注入 seed）。 */
export declare function mulberry32(seed: number): () => number;
/**
 * 由 seed 确定性地生成一关谜题。
 * @param seed - 任意 32 位整数种子。
 * @param level - 关卡（1 起）；超出范围按最后一关处理。
 * @returns 谜题（左右图案 + 差异列表 + 容差）。
 */
export declare function createPuzzle(seed: number, level: number): Puzzle;
/** 一局（单关）状态。 */
export interface SpotDiffState {
    /** 当前谜题。 */
    puzzle: Puzzle;
    /** 每处差异是否已被找到（与 puzzle.diffs 下标对应）。 */
    found: boolean[];
    /** 点错次数（每次扣 MISS_PENALTY_S 秒）。 */
    misses: number;
    /** 剩余时间（秒）。 */
    timeLeft: number;
    /** 当前关卡（1 起）。 */
    level: number;
    /** 局面：playing 进行中 / won 本关找齐 / lost 超时。 */
    status: 'playing' | 'won' | 'lost';
    /** 本局 seed（重开同关时换新 seed 由调用方决定）。 */
    seed: number;
}
/**
 * 生成某一关的初始状态。
 * @param seed - 谜题种子。
 * @param level - 关卡（1 起）。
 */
export declare function createSpotDiffState(seed: number, level: number): SpotDiffState;
/** 剩余未找到的差异数。 */
export declare function remainingDiffs(state: SpotDiffState): number;
/**
 * 判定一次点击：容差半径内存在未找到的差异则标记找到；否则记一次点错并扣时。
 * 两侧面板共用差异坐标，点击任一侧同一位置都算命中。
 * @param state - 当前局面（原地更新）。
 * @param x - 点击的面板内横坐标。
 * @param y - 点击的面板内纵坐标。
 * @returns 'hit' 命中一处差异；'miss' 点错（已扣时）；'busy' 局面已结束。
 */
export declare function tryClick(state: SpotDiffState, x: number, y: number): 'hit' | 'miss' | 'busy';
/**
 * 推进倒计时。时间归零且尚有未找差异时判负。
 * @param state - 当前局面（原地更新）。
 * @param dtS - 经过秒数（非负）。
 * @returns 更新后的状态字段 status。
 */
export declare function tick(state: SpotDiffState, dtS: number): 'playing' | 'won' | 'lost';
/**
 * 结算得分：已找差异 ×100 + 剩余时间取整 + 通关关卡奖励。
 * @param state - 当前局面。
 */
export declare function computeScore(state: SpotDiffState): number;
/** 是否还有下一关。 */
export declare function hasNextLevel(state: SpotDiffState): boolean;
