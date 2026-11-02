/**
 * 黑洞吞噬（Hole.io）确定性引擎：固定步长（TICK）的城市大世界模拟。
 * 40x30 街区格上确定性生成三类物体（小：树/灯 r6、中：车 r14、大：楼
 * r30）；玩家黑洞 + 2 个 AI 黑洞（holes[0] 恒为玩家）在街上移动，只能
 * 吞「质心距洞心 < 洞半径 x 0.85 且物体半径 < 洞半径 x 0.8」的物体；
 * 吞噬瞬间物体进入 200ms 向洞心收缩的沉没动画（SHRINK_TICKS），洞半径
 * 按面积守恒增长（r = sqrt(r^2 + objR^2 x GROWTH_K)）。口径跨过里程碑
 * 阈值即解锁更高级物体并广播浮字事件；口径差 > 1.3 倍的大洞可以咬小洞
 * 一口（面积转移、小洞变小）；120 秒（DURATION_TICKS）限时结束按口径
 * 结算排名。随机数全部走 mulberry32(seed, round)，同 seed 同输入的 tick
 * 序列完全一致（用 holeSnapshot 校验）。时间单位秒，物理单位 px。
 */
/** 固定模拟步长（秒，30 tick/s）。 */
export declare const TICK: number;
/** 街区格边长与网格规模（40x30 街区）。 */
export declare const BLOCK = 88;
export declare const GRID_COLS = 40;
export declare const GRID_ROWS = 30;
/** 世界尺寸（px）。 */
export declare const WORLD_W: number;
export declare const WORLD_H: number;
/** 街区内物体摆放区内缩（留出马路）。 */
export declare const LOT_INSET = 15;
/** 出生口径（半径）。 */
export declare const START_R = 14;
/** 吞噬距离因子：质心距 < 洞半径 x 0.85 才能吞。 */
export declare const EAT_DIST_FACTOR = 0.85;
/** 吞噬尺寸因子：物体半径 < 洞半径 x 0.8 才能吞。 */
export declare const EAT_SIZE_FACTOR = 0.8;
/** 面积成长系数：吞下后 r^2 增加 objR^2 x GROWTH_K。 */
export declare const GROWTH_K = 0.9;
/** 沉没动画时长（tick，200ms）。 */
export declare const SHRINK_TICKS = 6;
/** 局时长（tick，120 秒）。 */
export declare const DURATION_TICKS = 3600;
/** 玩家 / AI 移动速度（px/s，匀速）。 */
export declare const PLAYER_SPEED = 150;
export declare const AI_SPEED = 140;
/** AI 数量。 */
export declare const AI_COUNT = 2;
/** 大洞咬小洞的口径比门槛。 */
export declare const BITE_RATIO = 1.3;
/** 一口咬走的面积占受害者面积的比例。 */
export declare const BITE_AREA_FRAC = 0.3;
/** 同一洞两次咬人的冷却（tick）。 */
export declare const BITE_COOLDOWN_TICKS = 45;
/** 被咬后的最小口径（不再缩小）。 */
export declare const MIN_R = 8;
/** 口径里程碑：跨过阈值即广播浮字（阈值 = 恰好能吞下一档物体）。 */
export declare const MILESTONES: readonly {
    r: number;
    text: string;
}[];
/**
 * mulberry32 确定性随机数发生器（与其它游戏互不依赖的同名实现）。
 * @param seed - 非负整数种子。
 * @param round - 局号（同 seed 不同局生成不同城市）。
 * @returns 返回 [0,1) 均匀随机数的函数。
 */
export declare function mulberry32(seed: number, round?: number): () => number;
/** 物体三档：小（树/路灯）、中（汽车）、大（大楼）。 */
export type ObjectKind = 'tree' | 'lamp' | 'car' | 'building';
/** 各档半径（px）。 */
export declare const KIND_RADIUS: Record<ObjectKind, number>;
/** 城市里一件可吞物体；沉没期间 x/y/r 由引擎逐 tick 收缩更新。 */
export interface CityObject {
    id: number;
    kind: ObjectKind;
    x: number;
    y: number;
    r: number;
    /** 摆放朝向（车的车身方向，渲染用）。 */
    angle: number;
    /** 是否正在被吞（收缩动画中）。 */
    sinking: boolean;
    /** 开始沉没的 tick。 */
    sinkTick: number;
    /** 沉没起点（收缩插值用）。 */
    sinkX: number;
    sinkY: number;
    sinkR: number;
    /** 吞下它的洞下标。 */
    eater: number;
}
/** 一个黑洞（玩家或 AI）；holes[0] 恒为玩家。 */
export interface Hole {
    id: number;
    ai: boolean;
    name: string;
    x: number;
    y: number;
    /** 口径（半径）。 */
    r: number;
    /** 吞下的物体数（玩家分数）。 */
    eaten: number;
    /** 已越过的里程碑下标（只前进）。 */
    milestone: number;
    /** 咬人冷却剩余 tick。 */
    biteCooldown: number;
    /** 移动速度（px/s）。 */
    speed: number;
}
/** 单步内产生、供渲染层消费的可视事件。 */
export type HoleEvent = {
    type: 'milestone';
    x: number;
    y: number;
    text: string;
    holeId: number;
} | {
    type: 'bite';
    x: number;
    y: number;
    eaterId: number;
    victimId: number;
};
/** 结算时单个洞的排名行。 */
export interface HoleRankRow {
    name: string;
    ai: boolean;
    r: number;
    eaten: number;
    rank: number;
}
/** 时间到结算数据。 */
export interface HoleStats {
    seconds: number;
    rows: HoleRankRow[];
}
/** 一局游戏的完整可测状态。 */
export interface HoleState {
    tick: number;
    rng: () => number;
    nextObjectId: number;
    objects: CityObject[];
    /** 静态物体空间哈希（按 BLOCK 单元格存对象引用；沉没/移除对象跳过）。 */
    grid: CityObject[][];
    holes: Hole[];
    events: HoleEvent[];
    over: boolean;
    stats: HoleRankRow[] | null;
}
/** 玩家一 tick 的输入：黑洞匀速逼近的目标点（世界坐标）。 */
export interface HoleInput {
    targetX: number;
    targetY: number;
}
/**
 * 吞噬判定：质心距与物体半径双门槛。
 * @param holeR - 洞半径。
 * @param objR - 物体半径。
 * @param dist - 质心距。
 * @returns true 表示可吞。
 */
export declare function canSwallow(holeR: number, objR: number, dist: number): boolean;
/**
 * 吞下一件物体后的新口径（面积守恒式成长）。
 * @param r - 当前半径。
 * @param objR - 物体半径。
 * @returns 新半径。
 */
export declare function radiusAfterEat(r: number, objR: number): number;
/**
 * 新开一局：生成城市、玩家洞（世界中心）与 2 个 AI 洞（对角）。
 * @param seed - 外部种子（如日期）。
 * @param round - 第几局（同 seed 不同局城市不同）。
 * @returns 初始状态。
 */
export declare function createHole(seed: number, round?: number): HoleState;
/** 用当前 objects 重建静态物体空间哈希（生成/测试摆位后调用）。 */
export declare function rebuildGrid(state: HoleState): void;
/**
 * 测试摆位：整体替换物体集并重建哈希。
 * @param state - 目标状态。
 * @param objects - 新物体集（id 任意，沉没字段会被重置）。
 */
export declare function placeObjects(state: HoleState, objects: CityObject[]): void;
/** ---------------- 主步进 ---------------- */
/**
 * 推进恰好一个固定步长：玩家按输入目标匀速移动 -> AI 决策移动 -> 冷却
 * 递减 -> 吞噬检查 -> 洞对洞咬合 -> 沉没动画 -> 计时。时间到置 over 并
 * 填充结算排名 rows（此后本函数直接返回）。
 * @param state - 目标状态（原地推进）。
 * @param input - 玩家本 tick 输入（目标点）。
 */
export declare function stepHole(state: HoleState, input: HoleInput): void;
/**
 * 玩家当前名次（按口径面积，1 = 最大）。
 * @param state - 目标状态。
 * @returns 名次。
 */
export declare function playerRank(state: HoleState): number;
/**
 * 确定性重放校验快照：tick、各洞坐标/口径/吞数、场上物体数。
 * @param state - 目标状态。
 * @returns 可直接字符串比较的状态摘要。
 */
export declare function holeSnapshot(state: HoleState): string;
