/**
 * 潮汐赶海（Tide）纯逻辑：海滩网格上的定时博弈。海在网格顶部，滩涂在
 * 下部；水线按完全确定的时刻表进退——前 24s 退潮（水线 6→2 行线性后退），
 * 24s~40s 平潮（滩涂全露，拾贝黄金期），最后 20s 涨潮（水线以固定速度
 * 2→6 推进）。淹到的格子：物品被冲走，玩家被卷走扣 1 命并回到岸边起点。
 * 物品由 seed+round 经 mulberry32 确定性生成：贝壳/海星/珍珠基础价值
 * 1/3/10，深度带系数 ×1~×4（越靠近水线越贵）；每件物品只在暴露窗口内
 * 可拾取。3 命 5 轮，总分 = 拾获价值合计。全部函数确定性可测，时间
 * 单位毫秒。
 */
/** 逻辑画布尺寸。 */
export declare const W = 480;
export declare const H = 560;
/** 网格列数（水平）。 */
export declare const COLS = 10;
/** 网格行数（垂直，第 0 行是最深的海侧，最后一行是岸边）。 */
export declare const ROWS = 8;
/** 退潮终点水线（滩涂最深处暴露到第 2 行）。 */
export declare const LOW_ROW = 2;
/** 涨潮终点水线（第 6、7 行永不淹没，是安全区）。 */
export declare const MAX_FLOOD_ROW = 6;
/** 水线从 6 退到 2 所需 ms。 */
export declare const RETREAT_MS = 24000;
/** 退潮完成到涨潮开始之间的平潮 ms。 */
export declare const LULL_MS = 16000;
/** 涨潮 ms（水线固定速度 4 行 / 20000ms 推进）。 */
export declare const FLOOD_MS = 20000;
/** 一轮潮汐周期 ms。 */
export declare const ROUND_MS: number;
/** 总轮数。 */
export declare const ROUNDS = 5;
/** 初始命数。 */
export declare const LIVES = 3;
/** 每轮生成物品数。 */
export declare const ITEMS_PER_ROUND = 16;
/**
 * mulberry32 确定性随机数发生器。
 * @param seed - 非负整数种子。
 * @returns 返回 [0,1) 均匀随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/** 物品表：名称 / 基础价值 / 渲染色。索引即 kind。 */
export declare const ITEM_KINDS: readonly [{
    readonly name: "贝壳";
    readonly value: 1;
    readonly color: "#7dcfff";
}, {
    readonly name: "海星";
    readonly value: 3;
    readonly color: "#e0af68";
}, {
    readonly name: "珍珠";
    readonly value: 10;
    readonly color: "#f7768e";
}];
/** 潮汐相位：退潮 / 平潮 / 涨潮。 */
export type TidePhaseKind = 'ebb' | 'lull' | 'flood';
/**
 * 轮内时刻 → 潮汐相位（时刻表完全确定）。
 * @param t - 轮内毫秒。
 * @returns 退潮 / 平潮 / 涨潮。
 */
export declare function tidePhaseAt(t: number): TidePhaseKind;
/**
 * 轮内时刻 → 水线位置（浮点行号：行号 < 水线的格子被淹没）。
 * 退潮线性后退（4 行 / 24000ms），平潮停在 LOW_ROW，涨潮线性推进
 * （4 行 / 20000ms，比退潮快——涨潮不等人）。
 * @param t - 轮内毫秒。
 * @returns 水线行号（LOW_ROW ~ MAX_FLOOD_ROW）。
 */
export declare function waterLineAt(t: number): number;
/**
 * 某行滩涂在本轮的暴露时刻（退潮水线退过该行的瞬间）。
 * @param row - 行号（滩涂范围 LOW_ROW..MAX_FLOOD_ROW-1）。
 * @returns 该行开始可踏 / 物品开始可拾的轮内毫秒。
 */
export declare function exposeMsAt(row: number): number;
/**
 * 深度带系数：越靠近低潮水线（行号越小）越贵。行 5 → ×1，行 4 → ×2，
 * 行 3 → ×3，行 2 → ×4。
 * @param row - 行号。
 * @returns 价值倍数。
 */
export declare function bandOf(row: number): number;
/** 一件滩涂物品（位置 / 品种 / 结算价值 / 暴露时刻 / 是否已消失）。 */
export interface TideItem {
    col: number;
    row: number;
    kind: number;
    /** 结算价值 = 基础价值 × 深度带系数。 */
    value: number;
    /** 本轮暴露时刻 ms（此前不可见不可拾）。 */
    appearAt: number;
    /** 已拾取或被淹冲走。 */
    taken: boolean;
}
/** 阶段：进行中 / 结束。 */
export type TidePhase = 'playing' | 'over';
/** 单步内产生、供渲染层消费的可视事件。 */
export type TideEvent = {
    type: 'pickup';
    col: number;
    row: number;
    kind: number;
    value: number;
} | {
    type: 'wash';
    col: number;
    row: number;
    kind: number;
} | {
    type: 'swept';
    col: number;
    row: number;
} | {
    type: 'round';
    round: number;
} | {
    type: 'over';
};
/** 一局游戏的完整可测状态。 */
export interface TideState {
    /** 当前轮内已流逝 ms。 */
    t: number;
    /** 当前轮（1 起）。 */
    round: number;
    score: number;
    lives: number;
    phase: TidePhase;
    playerCol: number;
    playerRow: number;
    items: TideItem[];
    events: TideEvent[];
    rng: () => number;
}
/** 玩家本轮出生点（岸边安全带中央）。 */
export declare const START_COL: number;
export declare const START_ROW: number;
/**
 * 新开一局。
 * @param seed - 外部种子（如日期）。
 * @param run - 第几局（同 seed 不同局轨迹不同）。
 * @returns 初始状态。
 */
export declare function createTide(seed: number, run?: number): TideState;
/**
 * 当前水线（state.t 的便捷读取）。
 * @param state - 当前状态。
 * @returns 水线行号（浮点）。
 */
export declare function waterLine(state: TideState): number;
/**
 * 某格当前是否被淹。
 * @param state - 当前状态。
 * @param row - 行号。
 * @returns true 表示水线已漫过该行。
 */
export declare function isSubmerged(state: TideState, row: number): boolean;
/**
 * 玩家当前所在格的物品（已暴露且未消失时）。
 * @param state - 当前状态。
 * @returns 命中的物品，无则 null。
 */
export declare function itemAtPlayer(state: TideState): TideItem | null;
/**
 * 玩家移动一步（方向键 / WASD）：目标出界则原地不动；走到已暴露物品格
 * 立即拾取计分；主动走进水下格立即被卷走。
 * @param state - 目标状态。
 * @param dx - 水平步长（-1/0/1）。
 * @param dy - 垂直步长（-1 向海 / +1 向岸）。
 * @returns 是否实际移动。
 */
export declare function moveTide(state: TideState, dx: number, dy: number): boolean;
/**
 * 推进一帧：潮汐时钟、淹没物品冲走、玩家淹没判定、轮次推进与新一轮
 * 物品生成。事件写入 state.events，调用方每帧消费。
 * @param state - 目标状态。
 * @param dtMs - 帧间隔 ms。
 */
export declare function stepTide(state: TideState, dtMs: number): void;
