/**
 * 传送带分拣（Sorter）纯逻辑：三条传送带从左向右输送四种颜色的包裹，
 * 每条带末端有一个分流挡板；色键 1-4 一次性把全部挡板切到对应颜色。
 * 包裹抵达分流口时判定：挡板颜色与包裹颜色一致则滑入对应车厢（得分
 * + 连击），否则包裹坠出带尾（1 次失误，累计 3 次结束）。带速与生成
 * 密度随回合时间升档，全部由 mulberry32(seed, round) 确定性驱动；帧
 * 间隔先累加再按固定 10ms 子步推进，任意调用节奏下轨迹一致。输入以
 * 纯数据传入，同 seed + 同输入序列重放一致。
 */
/** 逻辑画布尺寸（HUD 条包含在该高度内）。 */
export declare const W = 520;
export declare const H = 560;
/** 三条传送带。 */
export declare const LANES = 3;
/** 包裹颜色数（同时也是车厢数与色键数）。 */
export declare const COLOR_COUNT = 4;
/** 带左端与分流口逻辑 x。 */
export declare const BELT_LEFT = 24;
export declare const DIVERT_X = 404;
/** 传送带厚度。 */
export declare const BELT_H = 28;
/** 包裹边长。 */
export declare const PACKAGE_SIZE = 26;
/** 允许的失误次数，超出即结束。 */
export declare const MAX_MISSES = 3;
/** 连击窗口 ms：窗口内再分拣成功则连击 +1。 */
export declare const COMBO_WINDOW_MS = 1200;
/** 连击上限。 */
export declare const COMBO_CAP = 10;
/** 每级连击附加分。 */
export declare const COMBO_BONUS = 1;
/** 分拣成功基础分。 */
export declare const BASE_SCORE = 2;
/** 每 12 秒升一档难度。 */
export declare const LEVEL_MS = 12000;
/** 固定子步 ms：stepSorter 内部按该粒度推进模拟。 */
export declare const SUBSTEP_MS = 10;
/** 飘字存活时长 ms。 */
export declare const FLOAT_MS = 800;
/** 四种包裹颜色（与主题色板对齐的固定十六进制，供渲染与测试断言）。 */
export declare const PACKAGE_COLORS: readonly ["#7aa2f7", "#9ece6a", "#f7768e", "#7dcfff"];
/**
 * mulberry32 确定性随机数发生器。
 * @param seed - 非负整数种子。
 * @returns 返回 [0,1) 均匀随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/** 一件在途包裹：颜色索引与带内逻辑 x。 */
export interface Package {
    color: 0 | 1 | 2 | 3;
    x: number;
}
/** 一条传送带：挡板当前指向的颜色、在途包裹与下一次生成时刻。 */
export interface Belt {
    lane: 0 | 1 | 2;
    flap: 0 | 1 | 2 | 3;
    packages: Package[];
    /** 下一次生成包裹的回合钟时刻 ms。 */
    /** 保留字段（旧每带节奏；现为全局节奏，见 SorterState.nextArrivalAt）。 */
    nextSpawnAt: number;
}
/** 上浮渐隐的飘字（得分 / 失误提示）。 */
export interface FloatText {
    x: number;
    y: number;
    text: string;
    life: number;
}
/** 单步内产生、供渲染层消费的可视事件。 */
export type SorterEvent = {
    type: 'sort';
    lane: 0 | 1 | 2;
    color: 0 | 1 | 2 | 3;
    x: number;
    y: number;
} | {
    type: 'miss';
    lane: 0 | 1 | 2;
    color: 0 | 1 | 2 | 3;
    x: number;
    y: number;
};
/** 一帧输入：flap 为按下色键对应的颜色（1-4 键 → 0-3），null 表示无。 */
export interface SorterInput {
    flap: 0 | 1 | 2 | 3 | null;
}
/** 一局游戏的完整可测状态。 */
export interface SorterState {
    /** 回合内已流逝 ms。 */
    t: number;
    /** 未消费的帧时间累加器 ms（固定子步用）。 */
    acc: number;
    score: number;
    misses: number;
    combo: number;
    /** 连击失效时刻 ms（回合钟）。 */
    comboExpire: number;
    /** 四节车厢各自的装载数。 */
    wagons: number[];
    belts: Belt[];
    events: SorterEvent[];
    floats: FloatText[];
    rng: () => number;
    over: boolean;
    /** 同一时刻共用的生成色（多带同刻到货同色）；-1 表示无当前共享。 */
    sharedColor: 0 | 1 | 2 | 3 | -1;
    /** 共享色对应的生成时刻 ms（跨时刻重掷）。 */
    sharedColorAt: number;
    /** 全局下一次到货时刻 ms——任意轨道的到达节奏（开局 2s 渐收至 0.5s）。 */
    nextArrivalAt: number;
}
/**
 * 传送带中心线逻辑 y。
 * @param lane - 带索引 0-2。
 * @returns 该带包裹中心的 y 坐标。
 */
export declare function laneY(lane: 0 | 1 | 2): number;
/**
 * 当前难度档位：随回合时间每 12 秒 +1。
 * @param tMs - 回合内毫秒钟。
 * @returns 从 1 开始的档位。
 */
export declare function levelOf(tMs: number): number;
/**
 * 带速 px/s：1 档 90，每档 +18，封顶 250。
 * @param level - 当前档位。
 * @returns 该档位的带速。
 */
export declare function beltSpeed(level: number): number;
/**
 * 每条带生成包裹的平均间隔 ms：开局 2000，逐档 -125，下限 500
 * （1 档 2s 从容起步 → 中盘 1s → 终盘 0.5s）。
 * @param level - 当前档位。
 * @returns 生成间隔的期望值。
 */
export declare function spawnMeanMs(level: number): number;
/**
 * 泊松间隔采样：指数分布 -ln(1-u)*mean，截断到 [0.35, 2.2] 倍期望。
 * @param rng - 随机源。
 * @param mean - 间隔期望 ms。
 * @returns 本次到下一次生成的间隔 ms。
 */
export declare function poissonInterval(rng: () => number, mean: number): number;
/**
 * 新开一局。
 * @param seed - 外部种子（如日期）。
 * @param round - 第几局（同一 seed 的不同局轨迹不同）。
 * @returns 初始状态。
 */
export declare function createSorter(seed: number, round?: number): SorterState;
/**
 * 推进一帧：先应用色键输入（把全部挡板切到 flap 色），再把帧时间累加
 * 并按固定 SUBSTEP_MS 子步确定性推进。事件写入 state.events，调用方每
 * 帧消费（下一帧开头清空）。
 * @param state - 目标状态。
 * @param dtMs - 帧间隔 ms。
 * @param input - 本帧输入（色键 / 无）。
 */
export declare function stepSorter(state: SorterState, dtMs: number, input: SorterInput): void;
