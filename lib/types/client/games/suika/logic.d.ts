/**
 * 合成大西瓜（Suika）纯逻辑：确定性 2D 圆形水果物理。玩家选一列 x 投放
 * 水果，固定 120Hz 子步积分：重力 + 圆-圆碰撞（位置修正按半径配重 +
 * 冲量法向反弹），同级两圆接触即合成上一级并爆分（产生 merge 事件供
 * 渲染层放粒子/浮字，合成到最高级西瓜额外 +500）。顶部警戒线：水果
 * （脱离投放保护期后）稳定停在警戒线以上持续一段时间即 game over。
 * 时间单位毫秒，物理单位 px / s，同 seed 同输入逐步模拟完全确定。
 */
/** 逻辑画布尺寸（竖向容器）。 */
export declare const W = 480;
export declare const H = 640;
/** 左右墙内侧 x。 */
export declare const WALL_L = 12;
/** 右墙内侧 x。 */
export declare const WALL_R: number;
/** 地面 y（水果底部落点）。 */
export declare const FLOOR_Y: number;
/** 顶部警戒线 y：水果稳定越过（圆顶高于）此线判负。 */
export declare const WARN_Y = 132;
/** 投放高度 y（警戒线上方）。 */
export declare const DROP_Y = 64;
/** 重力加速度 px/s^2。 */
export declare const GRAVITY = 1500;
/** 固定物理子步 ms（120Hz，确定性可测）。 */
export declare const SUBSTEP_MS: number;
/** 碰撞法向反弹恢复系数（软塌堆积感）。 */
export declare const RESTITUTION = 0.12;
/** 地面切向摩擦（每子步速度保留率）。 */
export declare const GROUND_FRICTION = 0.985;
/** 投放冷却 ms。 */
export declare const DROP_COOLDOWN_MS = 400;
/** 新投放水果的稳定判定豁免 ms（下落穿越警戒线不算）。 */
export declare const GRACE_MS = 700;
/** 视为稳定的合速度平方阈值 (px/s)^2。 */
export declare const SETTLE_SPEED2: number;
/** 稳定越线持续该 ms 后 game over。 */
export declare const OVER_MS = 900;
/** 最高级索引（西瓜）。 */
export declare const MAX_LEVEL = 10;
/** 合成到西瓜的额外奖励分。 */
export declare const WATERMELON_BONUS = 500;
/** 浮字存活 ms。 */
export declare const FLOAT_MS = 950;
/** 各级水果半径 px（樱桃→西瓜，11 级递增）。 */
export declare const FRUIT_RADII: readonly [15, 21, 27, 34, 42, 51, 61, 72, 84, 97, 112];
/** 各级水果中文名。 */
export declare const FRUIT_NAMES: readonly ["樱桃", "草莓", "葡萄", "柠檬", "橙子", "苹果", "梨", "桃子", "菠萝", "哈密瓜", "西瓜"];
/** 合成出第 i 级水果的得分（三角数表）。 */
export declare const MERGE_POINTS: readonly [1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 66];
/** 预备（下一个可投放）水果的最高级索引：前 5 级随机。 */
export declare const NEXT_LEVEL_MAX = 4;
/**
 * mulberry32 确定性随机数发生器。
 * @param seed - 非负整数种子。
 * @returns 返回 [0,1) 均匀随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/** 阶段：进行中 / 结束。 */
export type SuikaPhase = 'play' | 'over';
/** 单步内产生、供渲染层消费的可视事件。 */
export type SuikaEvent = {
    type: 'merge';
    x: number;
    y: number;
    level: number;
    gained: number;
    bonus: boolean;
} | {
    type: 'drop';
    x: number;
    y: number;
    level: number;
};
/** 上浮渐隐的浮字。 */
export interface FloatText {
    x: number;
    y: number;
    text: string;
    life: number;
}
/** 场上一个圆形水果。 */
export interface Fruit {
    /** 自增 id（合成替换后作区分）。 */
    id: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    /** 等级 0（樱桃）..10（西瓜）。 */
    level: number;
    /** 出生时刻 ms（投放豁免期判定用）。 */
    born: number;
}
/** 一局游戏的完整可测状态。 */
export interface SuikaState {
    /** 本局累计模拟 ms。 */
    t: number;
    seed: number;
    score: number;
    phase: SuikaPhase;
    /** 当前投放列 x。 */
    dropX: number;
    /** 投放冷却剩余 ms。 */
    cooldownMs: number;
    /** 手上待投放水果等级。 */
    next: number;
    /** 再下一个水果等级（预览）。 */
    nextNext: number;
    /** 本局合成出的最高等级。 */
    topLevel: number;
    /** 稳定越线累计 ms（达 OVER_MS 判负）。 */
    overMs: number;
    fruits: Fruit[];
    events: SuikaEvent[];
    floats: FloatText[];
    /** 剩余子步累计器 ms（固定步长积分）。 */
    accMs: number;
    /** 下一个水果 id。 */
    nextId: number;
    rng: () => number;
}
/** 水果半径查表。 */
export declare function fruitRadius(level: number): number;
/** 投放列 x 的合法范围（按手上水果半径收边）。 */
export declare function clampDropX(x: number, level: number): number;
/**
 * 开新局：清空场地，预备两个随机前 5 级水果。
 * @param seed - 非负整数随机种子。
 * @returns 初始状态。
 */
export declare function createSuika(seed: number): SuikaState;
/**
 * 移动投放列。
 * @param state - 游戏状态。
 * @param x - 目标 x，按手上水果半径自动收边。
 */
export declare function moveDrop(state: SuikaState, x: number): void;
/**
 * 投放手上水果（冷却中或已结束返回 false）。
 * @param state - 游戏状态。
 * @returns 是否成功投放。
 */
export declare function dropFruit(state: SuikaState): boolean;
/**
 * 推进一帧：固定 120Hz 子步积分 + 合成 + 警戒线判定，并推进浮字。
 * @param state - 游戏状态。
 * @param dtMs - 距上帧 ms（内部按固定子步消费，dt 语义无累积误差）。
 */
export declare function stepSuika(state: SuikaState, dtMs: number): void;
