/**
 * 月球着陆（Lunar Lander）纯逻辑：登月舱在重力下坠向由 seed+level
 * 确定性生成的折线山脊，方向键控制姿态与点火（沿机体方向推力，消耗
 * 燃料）。山脊上嵌有 1~3 块平坦着陆 pad，pad 越窄得分倍率越高；平稳
 * （慢速、直立、在 pad 上）着陆进入下一关（山更陡、pad 更窄更少、重力
 * 更大），非 pad 或超速/倾覆坠毁 -1 命，共 3 命。全部函数确定性可测，
 * 时间单位毫秒，物理单位 px / s。
 */
/** 逻辑画布尺寸。 */
export declare const W = 480;
export declare const H = 640;
/** 基础重力加速度 px/s^2，每级 +GRAVITY_PER_LEVEL，封顶 GRAVITY_MAX。 */
export declare const GRAVITY_BASE = 80;
export declare const GRAVITY_PER_LEVEL = 10;
export declare const GRAVITY_MAX = 160;
/** 点火推力加速度 px/s^2（机体方向）。 */
export declare const THRUST = 260;
/** 旋转角速度 rad/s。 */
export declare const ROT_SPEED = 2.4;
/** 燃料上限（每关 / 每次重生回满）。 */
export declare const FUEL_MAX = 100;
/** 燃料消耗 /s。 */
export declare const FUEL_BURN = 26;
/** 初始生命。 */
export declare const START_LIVES = 3;
/** 平稳着陆阈值：垂直速度 px/s。 */
export declare const LAND_VY_MAX = 60;
/** 平稳着陆阈值：水平速度 px/s。 */
export declare const LAND_VX_MAX = 40;
/** 平稳着陆阈值：倾角 rad。 */
export declare const LAND_TILT_MAX = 0.35;
/** 登月舱碰撞半高 px（触地判定用）。 */
export declare const LANDER_HALF = 11;
/** 着陆结算后的停留 ms。 */
export declare const LANDED_MS = 1600;
/** 坠毁展示 ms（之后自动重生同关）。 */
export declare const CRASHED_MS = 1400;
/**
 * mulberry32 确定性随机数发生器。
 * @param seed - 非负整数种子。
 * @returns 返回 [0,1) 均匀随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/** 当前关卡重力加速度 px/s^2。 */
export declare function gravityOf(level: number): number;
/** 一块平坦着陆 pad：x 区间、地面高度与得分倍率。 */
export interface Pad {
    x1: number;
    x2: number;
    y: number;
    /** 得分倍率（窄 pad 更高，1~4）。 */
    mult: number;
}
/** 折线山脊：顶点从左到右等距分布。 */
export interface Terrain {
    points: {
        x: number;
        y: number;
    }[];
    pads: Pad[];
}
/**
 * 生成某一关的山脊与 pad（seed+level 确定性）。
 * 关卡越高：顶点越密起伏越大、pad 数 3→1、pad 越窄、倍率越高。
 * @param seed - 外部种子。
 * @param level - 关卡号（从 1 起）。
 * @returns 山脊数据。
 */
export declare function generateTerrain(seed: number, level: number): Terrain;
/**
 * 山脊在 x 处的地面高度（线性插值）。
 * @param terrain - 山脊数据。
 * @param x - 横坐标。
 * @returns 地面 y（越大越低）。
 */
export declare function groundAt(terrain: Terrain, x: number): number;
/**
 * x 是否落在某块 pad 上。
 * @param terrain - 山脊数据。
 * @param x - 横坐标。
 * @returns 命中的 pad，未命中返回 null。
 */
export declare function padAt(terrain: Terrain, x: number): Pad | null;
/** 帧输入：左 / 右旋转与点火。 */
export interface LanderInput {
    left: boolean;
    right: boolean;
    thrust: boolean;
}
/** 阶段：飞行 / 着陆成功展示 / 坠毁展示 / 命尽结束。 */
export type LanderPhase = 'flying' | 'landed' | 'crashed' | 'gameover';
/** 单步内产生、供渲染层消费的可视事件。 */
export type LanderEvent = {
    type: 'land';
    x: number;
    y: number;
    points: number;
} | {
    type: 'crash';
    x: number;
    y: number;
};
/** 上浮渐隐的飘字。 */
export interface FloatText {
    x: number;
    y: number;
    text: string;
    life: number;
}
/** 飘字存活时长 ms。 */
export declare const FLOAT_MS = 1200;
/** 一局游戏的完整可测状态。 */
export interface LanderState {
    /** 回合内已流逝 ms（渲染闪烁用）。 */
    t: number;
    seed: number;
    level: number;
    score: number;
    lives: number;
    fuel: number;
    /** 舱体位置 / 速度 / 倾角（0 = 直立，正 = 顺时针）。 */
    x: number;
    y: number;
    vx: number;
    vy: number;
    angle: number;
    /** 当前帧是否点火中（渲染火焰用，step 每帧写入）。 */
    thrusting: boolean;
    terrain: Terrain;
    phase: LanderPhase;
    /** 阶段停留剩余 ms。 */
    phaseMs: number;
    /** 着陆结算展示分（landed 阶段 HUD 用）。 */
    lastPoints: number;
    events: LanderEvent[];
    floats: FloatText[];
}
/**
 * 新开一局（level 1）。
 * @param seed - 外部种子。
 * @returns 初始状态。
 */
export declare function createLander(seed: number): LanderState;
/**
 * 推进一帧：飞行物理（重力 / 推力 / 旋转 / 燃料）、触地判定、
 * 阶段停留与过关切换、飘字。事件写入 state.events，下一帧开头清空。
 * @param state - 目标状态。
 * @param dtMs - 帧间隔 ms。
 * @param input - 当前帧输入。
 */
export declare function stepLander(state: LanderState, dtMs: number, input: LanderInput): void;
/**
 * 当前离地高度 px（HUD 用）。
 * @param state - 当前状态。
 * @returns 舱底到地面的竖直距离。
 */
export declare function altitude(state: LanderState): number;
