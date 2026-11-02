/**
 * 迷你高尔夫纯逻辑：确定性俯视推球物理与 8 关手工关卡表。
 *
 * 物理为固定子步积分：摩擦用指数衰减（沙坑区域摩擦 ×4）、斜坡区域施加
 * 恒定加速度、墙壁与边界做圆形-AABB 反弹（镜像 + 衰减）、洞口在
 * "速度低于阈值且距洞小于洞半径" 时捕获球。所有关卡为手工参数表，
 * 无随机数——相同输入必然得到相同轨迹（渲染层只画状态，不参与模拟）。
 */
/** 球场世界坐标宽度（内部可玩区域）。 */
export declare const FIELD_W = 200;
/** 球场世界坐标高度（内部可玩区域）。 */
export declare const FIELD_H = 120;
/** 球半径。 */
export declare const BALL_R = 2.2;
/** 洞口半径（捕获距离阈值）。 */
export declare const HOLE_R = 3.6;
/** 草地摩擦率（每秒指数衰减系数 v *= exp(-k·dt)）。 */
export declare const FRICTION_K = 0.9;
/** 沙坑摩擦倍率。 */
export declare const SAND_MULT = 4;
/** 墙壁反弹恢复系数（镜像后乘以该系数）。 */
export declare const WALL_RESTITUTION = 0.78;
/** 低于该速度球停住。 */
export declare const STOP_SPEED = 4.5;
/** 洞口捕获的最大球速。 */
export declare const CAPTURE_SPEED = 34;
/** 满蓄力对应的击球初速。 */
export declare const MAX_SHOT_SPEED = 250;
/** 单个子步的最大时长（防穿墙）。 */
export declare const MAX_SUBSTEP_DT: number;
/** 关卡总数。 */
export declare const LEVEL_COUNT = 8;
/** 平面坐标点。 */
export interface Vec {
    x: number;
    y: number;
}
/** 轴对齐矩形墙。 */
export interface WallRect {
    x: number;
    y: number;
    w: number;
    h: number;
}
/** 斜坡区域：球心进入后每秒获得 (ax, ay) 的恒定加速度。 */
export interface SlopeRect extends WallRect {
    ax: number;
    ay: number;
}
/** 沙坑区域：球心进入后摩擦 ×SAND_MULT。 */
export interface SandRect extends WallRect {
}
/** 一关的完整手工参数。 */
export interface GolfLevelDef {
    level: number;
    /** 标准杆。 */
    par: number;
    /** 发球点。 */
    tee: Vec;
    /** 洞口位置。 */
    hole: Vec;
    walls: WallRect[];
    slopes: SlopeRect[];
    sands: SandRect[];
}
export type GolfPhase = 'aiming' | 'rolling' | 'levelDone' | 'allDone' | 'paused';
export interface GolfBall {
    x: number;
    y: number;
    vx: number;
    vy: number;
    atRest: boolean;
}
export type GolfEvent = {
    kind: 'sink';
    level: number;
    strokes: number;
    par: number;
    stars: number;
} | {
    kind: 'stop';
};
export interface MiniGolfState {
    phase: GolfPhase;
    level: number;
    strokes: number;
    /** 本次运行累计星数（作为上报分数）。 */
    totalStars: number;
    ball: GolfBall;
    hole: Vec;
    /** 本杆滚动轨迹（淡痕渲染用）。 */
    trail: Vec[];
    events: GolfEvent[];
    /** 暂停前的相位（恢复用）。 */
    pausedFrom: GolfPhase | null;
    msg: string;
    /** 消息剩余显示秒数。 */
    msgTimer: number;
}
/** 8 关手工关卡表：直道 → L 弯 → 沙坑 → 斜坡 → 组合难度递增。 */
export declare const LEVELS: GolfLevelDef[];
/** 取指定关（1 基）的参数表；越界回环绕回。 */
export declare function getLevel(level: number): GolfLevelDef;
/** 星级：≤par 三星，≤par+1 两星，其余一星。 */
export declare function starFor(strokes: number, par: number): number;
/** 点是否位于某个矩形（含边界）内。 */
export declare function inRect(px: number, py: number, r: WallRect): boolean;
/** 球心是否落在某个沙坑内。 */
export declare function inSand(x: number, y: number, def: GolfLevelDef): boolean;
/** 取球心所在斜坡的加速度（多区域叠加）。 */
export declare function slopeAccel(x: number, y: number, def: GolfLevelDef): Vec;
/** 构造某关的初始状态（杆数清零、球放发球点）。 */
export declare function createGolfLevel(level: number, totalStars?: number): MiniGolfState;
/**
 * 圆形与轴对齐矩形的碰撞反弹：找最近点，沿穿透较小的轴推出并镜像该轴
 * 速度分量（乘恢复系数）。返回是否发生了一次迎面碰撞。
 * @param ball - 球（被原地修改）。
 * @param rect - 目标矩形。
 */
export declare function collideRect(ball: GolfBall, rect: WallRect): boolean;
/**
 * 推进整帧：按最大子步长切分后调用 substep；记录轨迹点；球停后回到
 * aiming 相位、入洞则进入 levelDone 并产出 sink 事件。
 * @param state - 游戏状态（被原地修改）。
 * @param dt - 帧时长（秒）。
 */
export declare function step(state: MiniGolfState, dt: number): void;
/**
 * 击球：只在 aiming 相位合法。力度被钳制到 [0,1]，初速 = power ×
 * MAX_SHOT_SPEED。清空上一杆轨迹。
 * @param state - 游戏状态（被原地修改）。
 * @param angle - 击球方向（弧度，0 = +x）。
 * @param power - 蓄力 0..1。
 * @returns 是否成功击球。
 */
export declare function shoot(state: MiniGolfState, angle: number, power: number): boolean;
/** 重开当前关（杆数清零、球回发球点；保留累计星）。 */
export declare function restartLevel(state: MiniGolfState): void;
/** 入洞后进入下一关（第 8 关后回到第 1 关；保留累计星）。 */
export declare function nextLevel(state: MiniGolfState): void;
/** 切换暂停（记住原相位以便恢复）。 */
export declare function togglePause(state: MiniGolfState): void;
