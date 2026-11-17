/**
 * 弹珠瀑布 Plinko 纯逻辑：确定性固定子步物理。
 *
 * 盘面（逻辑坐标 640x480）：顶部 9 个投放列，9 行交错三角钉阵
 * （偶数行 10 钉、奇数行 9 钉，行距 30），两侧竖直墙，底部 11 个
 * 倍率槽（边缘低、中央高不对称分布）。
 *
 * 确定性：弹珠-钉碰撞不做真随机——每颗弹珠生成时由 runSeed + 弹珠
 * 序号派生一个子 seed（mulberry32 流），碰钉时按碰撞侧法线 + 当前
 * 速度 + 子 seed 伪随机扰动决定反弹角；因此「同投放点 + 同子 seed」
 * 在相同步长序列下逐位可重放。
 *
 * 轮次：共 3 轮、每轮 5 颗弹珠；落槽结算 = 底注 10 × 倍率。第 1 轮
 * 结束后解锁直方图预览（各投放列的历史落槽分布，辅助选择投放点）。
 */
export declare const BOARD_W = 640;
export declare const BOARD_H = 480;
/** 左右竖直墙（弹珠在墙内反弹）。 */
export declare const WALL_L = 70;
export declare const WALL_R = 570;
/** 底部倍率槽：11 槽，槽顶 SLOT_Y、槽高 SLOT_H。 */
export declare const SLOT_Y = 402;
export declare const SLOT_H = 46;
export declare const SLOT_COUNT = 11;
export declare const SLOT_W: number;
/** 倍率表：边缘低、中央高（不对称峰值）。 */
export declare const SLOT_MULTIPLIERS: readonly number[];
/** 钉阵：9 行，行距 30，首行 y=128。 */
export declare const PEG_ROWS = 9;
export declare const PEG_Y0 = 128;
export declare const PEG_DY = 30;
export declare const PEG_R = 5;
export declare const BALL_R = 6;
/** 顶部投放区：9 列，与槽宽对齐展开在盘面中心两侧。 */
export declare const DROP_COLS = 9;
export declare const DROP_Y = 70;
export declare const DROP_GAP: number;
export declare const BOARD_CX: number;
export declare const ROUNDS = 3;
export declare const BALLS_PER_ROUND = 5;
export declare const BASE_BET = 10;
/** 两次投放之间的最小间隔（模拟秒）。 */
export declare const DROP_COOLDOWN = 0.3;
export declare const SUB: number;
/** 一颗钉。 */
export interface Peg {
    x: number;
    y: number;
    row: number;
    col: number;
}
/**
 * 构建三角钉阵：偶数行 10 钉（槽边界上方），奇数行 9 钉（槽中心上方），
 * 两类行的横坐标互相错开半个槽宽。
 * @returns 全部钉，按行序、行内从左到右。
 */
export declare function buildPegs(): Peg[];
/** 钉阵（纯几何，静态单例）。 */
export declare const PEGS: readonly Peg[];
/**
 * mulberry32 单步推进（函数式，便于逐位重放与断言）。
 * @param state - 当前 32 位内部状态。
 * @returns [0,1) 伪随机值与推进后的状态。
 */
export declare function mulberryNext(state: number): {
    value: number;
    next: number;
};
/**
 * 由 runSeed 与弹珠序号派生子 seed：同 run 同序号的弹珠扰动流相同。
 * @param runSeed - 本局种子。
 * @param index - 弹珠序号（从 0 起）。
 * @returns 32 位子 seed。
 */
export declare function ballSubSeed(runSeed: number, index: number): number;
/** 一颗飞行中的弹珠。trail 为最近位置（渲染拖尾），长度 ≤ TRAIL_MAX。 */
export interface PlinkoBall {
    id: number;
    col: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    /** 模拟寿命（秒）。 */
    age: number;
    /** mulberry32 内部状态（子 seed 起步）。 */
    rngState: number;
    trail: {
        x: number;
        y: number;
    }[];
}
export type PlinkoEvent = {
    kind: 'drop';
    id: number;
    col: number;
    x: number;
} | {
    kind: 'land';
    id: number;
    col: number;
    slot: number;
    mult: number;
    points: number;
    x: number;
    y: number;
} | {
    kind: 'roundEnd';
    round: number;
    roundScore: number;
} | {
    kind: 'ended';
    score: number;
};
export interface PlinkoState {
    runSeed: number;
    phase: 'playing' | 'ended';
    /** 当前轮（1..ROUNDS）。 */
    round: number;
    ballsLeft: number;
    aimCol: number;
    balls: PlinkoBall[];
    score: number;
    /** 本轮累计分。 */
    roundScore: number;
    cooldown: number;
    elapsed: number;
    /** 已投出弹珠总数（子 seed 序号来源）。 */
    dropped: number;
    completedRounds: number;
    /** 全部落槽记录（slot + 得分）。 */
    landings: {
        slot: number;
        points: number;
    }[];
    /** 直方图：histogram[投放列][槽] = 落槽次数。 */
    histogram: number[][];
    events: PlinkoEvent[];
}
/**
 * 投放列的横坐标。
 * @param col - 投放列（0..DROP_COLS-1）。
 * @returns 列中心的 x 坐标。
 */
export declare function dropColX(col: number): number;
/**
 * 横坐标对应的槽序号（钳制到 [0, SLOT_COUNT)）。
 * @param x - 横坐标。
 * @returns 槽序号。
 */
export declare function slotIndexForX(x: number): number;
/**
 * 槽 i 的落槽得分 = 底注 × 倍率。
 * @param slot - 槽序号。
 * @returns 得分（整数）。
 */
export declare function slotPoints(slot: number): number;
/**
 * 创建一局新游戏。
 * @param seed - 本局随机种子（派生各弹珠子 seed）。
 * @returns 初始状态（第 1 轮、瞄准中央列）。
 */
export declare function createGame(seed: number): PlinkoState;
/**
 * 在当前瞄准列投放一颗弹珠；受冷却与弹珠余量限制。
 * @param s - 游戏状态。
 * @returns 是否投放成功。
 */
export declare function dropBall(s: PlinkoState): boolean;
/**
 * 在指定列投放一颗弹珠（子 seed 由 runSeed + 弹珠序号派生）。
 * @param s - 游戏状态。
 * @param col - 投放列（钳制到 [0, DROP_COLS)）。
 * @returns 是否投放成功（进行中、有余量、冷却结束）。
 */
export declare function dropBallAt(s: PlinkoState, col: number): boolean;
/**
 * 移动瞄准列（钳制）。
 * @param s - 游戏状态。
 * @param dir - -1 左移 / +1 右移。
 */
export declare function moveAim(s: PlinkoState, dir: number): void;
/**
 * 推进一颗弹珠一个子步：重力积分、墙反弹、钉碰撞（反弹 + 子 seed 扰动）。
 * @param ball - 弹珠。
 * @param h - 子步长（秒）。
 * @returns 落槽序号（弹珠越过槽顶或超龄），未落定返回 null。
 */
export declare function stepBall(ball: PlinkoBall, h: number): number | null;
/**
 * 推进一帧（内部固定子步，确定性）：积分全部弹珠、落槽结算、轮次推进。
 * @param s - 游戏状态。
 * @param dt - 帧时长（秒，内部按 SUB 子步积分）。
 */
export declare function step(s: PlinkoState, dt: number): void;
/**
 * 直方图预览是否已解锁（完成至少一轮后开放）。
 * @param s - 游戏状态。
 * @returns 是否解锁。
 */
export declare function previewUnlocked(s: PlinkoState): boolean;
/**
 * 某投放列的历史落槽分布。
 * @param s - 游戏状态。
 * @param col - 投放列。
 * @returns 各槽落槽次数（长度 SLOT_COUNT）。
 */
export declare function colDistribution(s: PlinkoState, col: number): number[];
