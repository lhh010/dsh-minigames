/**
 * 旋转迷宫（Tilt Maze）纯逻辑：seed 生成「同心环墙 + 辐条墙」的圆形迷宫
 * 盘——生成器先从中心随机游走 carve 出一条通往外圈的缺口路径（路径终点
 * 所在外环格即为终点孔），再按关卡密度随机补开额外缺口，保证起点到
 * 终点恒有通路；沿途在非路径格布置尖刺陷阱。小球在屏幕系受恒定向下的
 * 重力加速、撞墙反弹衰减；玩家旋转盘面（boardAngle 变化，墙与陷阱在
 * 盘面局部系静止），碰撞时把球坐标旋到盘面系检测，推出量与法线再旋回
 * 屏幕系——重力恒为屏幕向下。固定子步（1/240 s）确定性物理，全部函数
 * 可脱离 DOM 直接模拟验证。
 */
/** 逻辑画布宽度 px。 */
export declare const W = 480;
/** 逻辑画布高度 px。 */
export declare const H = 560;
/** 盘面中心 x px。 */
export declare const CX = 240;
/** 盘面中心 y px。 */
export declare const CY = 300;
/** 小球半径 px。 */
export declare const BALL_R = 6;
/** 屏幕系重力加速度 px/s²（恒向下）。 */
export declare const GRAVITY = 760;
/** 按住左/右时盘面旋转角速度 rad/s。 */
export declare const SPIN_SPEED = 1.9;
/** 撞墙法向反弹恢复系数。 */
export declare const RESTITUTION = 0.42;
/** 空气阻力系数（每秒速度线性衰减比例）。 */
export declare const AIR_DRAG = 0.08;
/** 固定物理子步时长 s。 */
export declare const SUBSTEP: number;
/** 尖刺陷阱判定半径 px。 */
export declare const TRAP_R = 10;
/** 中心轮毂半径 px（环 1 辐条不伸进轮毂，出生点无墙重叠）。 */
export declare const HUB_R = 58;
/** 二维向量 / 点。 */
export interface Vec {
    /** x 分量。 */
    x: number;
    /** y 分量。 */
    y: number;
}
/** 盘面局部系中的一条碰撞线段（含弧墙的短弦近似）。 */
export interface Segment {
    /** 端点 1 x。 */
    x1: number;
    /** 端点 1 y。 */
    y1: number;
    /** 端点 2 x。 */
    x2: number;
    /** 端点 2 y。 */
    y2: number;
}
/** 一关的迷宫盘布局（全部坐标为盘面局部系，盘心为原点）。 */
export interface TiltMazeLevel {
    /** 关卡号（从 1 起）。 */
    level: number;
    /** 环数（径向格层数）。 */
    rings: number;
    /** 辐条数（角向格数）。 */
    spokes: number;
    /** 盘面外半径 px。 */
    outerR: number;
    /** 单环径向宽度 px（outerR / rings）。 */
    ringGap: number;
    /** 环墙矩阵：ringWalls[i][s] = 半径 i*ringGap、跨格 (i,s) 角度的弧墙；i=rings 为外环。 */
    ringWalls: boolean[][];
    /** 辐墙矩阵：spokeWalls[i][s] = 角度 s*TAU/spokes、跨环 i-1..i 的径向墙。 */
    spokeWalls: boolean[][];
    /** 尖刺陷阱位置（格心，盘面系）。 */
    traps: Vec[];
    /** 终点孔所在外环格辐条号。 */
    goalSpoke: number;
    /** 终点孔中心角 rad。 */
    goalAngle: number;
    /** 终点孔判定半弧角 rad。 */
    goalHalfArc: number;
    /** 本关时限 s。 */
    timeLimit: number;
}
/** 一局运行时状态（球坐标为屏幕系、盘心为原点的相对坐标）。 */
export interface TiltMazeState {
    /** 基础种子。 */
    seed: number;
    /** 关卡号。 */
    level: number;
    /** 迷宫布局。 */
    maze: TiltMazeLevel;
    /** 碰撞线段（盘面系，由布局展开）。 */
    segments: Segment[];
    /** 盘面当前旋转角 rad（墙随它旋转）。 */
    boardAngle: number;
    /** 球心 x。 */
    bx: number;
    /** 球心 y。 */
    by: number;
    /** 球速度 x px/s。 */
    vx: number;
    /** 球速度 y px/s。 */
    vy: number;
    /** 旋转输入：-1 逆时针 / 0 静止 / 1 顺时针。 */
    spin: -1 | 0 | 1;
    /** 剩余时间 s。 */
    timeLeft: number;
    /** 对局状态。 */
    status: 'playing' | 'won' | 'lost';
    /** 失败原因（仅 status='lost' 时有意义）。 */
    loseReason: '' | 'trap' | 'timeout';
    /** 当前潜在得分（过关时定格为最终得分）。 */
    score: number;
}
/**
 * mulberry32 确定性伪随机数发生器。
 * @param seed - 32 位种子。
 * @returns 返回 [0,1) 随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/**
 * 点绕原点旋转。
 * @param x - 原横坐标。
 * @param y - 原纵坐标。
 * @param a - 旋转角 rad（正为顺时针，屏幕系 y 向下）。
 * @returns 旋转后的点。
 */
export declare function rotatePoint(x: number, y: number, a: number): Vec;
/**
 * 两角之差归一到 [0, π]。
 * @param a - 角 1 rad。
 * @param b - 角 2 rad。
 * @returns 最小角差。
 */
export declare function angDiff(a: number, b: number): number;
/**
 * 点到线段的最近点。
 * @param px - 点 x。
 * @param py - 点 y。
 * @param seg - 线段。
 * @returns 线段上的最近点。
 */
export declare function closestPointOnSegment(px: number, py: number, seg: Segment): Vec;
/** 圆对线段的碰撞解算结果。 */
export interface CircleHit {
    /** 推出方向单位法线 x（由线段指向圆心）。 */
    nx: number;
    /** 推出方向单位法线 y。 */
    ny: number;
    /** 穿透深度 px。 */
    depth: number;
}
/**
 * 圆 vs 线段碰撞检测与推出量解算。
 * @param px - 圆心 x。
 * @param py - 圆心 y。
 * @param r - 圆半径。
 * @param seg - 线段。
 * @returns 命中时返回推出法线与深度；未命中返回 null。
 */
export declare function resolveCircleSegment(px: number, py: number, r: number, seg: Segment): CircleHit | null;
/**
 * 把布局的墙矩阵展开为碰撞线段（弧墙以不超过 MAX_CHORD 的短弦近似，
 * 弦位于弧内侧，视觉弧与碰撞误差 < 1px）。
 * @param maze - 迷宫布局。
 * @returns 碰撞线段数组（盘面系）。
 */
export declare function buildSegments(maze: TiltMazeLevel): Segment[];
/**
 * 盘面连通性检查：以全部环 1 格为起点（中心轮毂向各环 1 格开放），
 * 沿未封闭的辐墙与内环墙 BFS，可达任一外环缺口格即有通路。
 * @param ringWalls - 环墙矩阵。
 * @param spokeWalls - 辐墙矩阵。
 * @param rings - 环数。
 * @param spokes - 辐条数。
 * @returns true 当中心区域可达外环任一缺口。
 */
export declare function pathExists(ringWalls: boolean[][], spokeWalls: boolean[][], rings: number, spokes: number): boolean;
/**
 * 生成第 level 关布局：全墙初始化 → 从中心随机游走 carve 一条到外环的
 * 缺口路径（终点孔即路径终格）→ 按关卡密度随机补开额外内墙缺口 → 在
 * 非路径格随机放置尖刺陷阱。
 * @param seed - 基础种子（与关卡号联合散列）。
 * @param level - 关卡号（从 1 起，超出 5 封顶到 5 档配置）。
 * @returns 迷宫布局（恒含通路）。
 */
export declare function generateLevel(seed: number, level: number): TiltMazeLevel;
/**
 * 计算当前潜在得分：基础分随关卡递增，剩余时间每秒加 8。
 * @param level - 关卡号。
 * @param timeLeft - 剩余时间 s。
 * @returns 得分。
 */
export declare function computeScore(level: number, timeLeft: number): number;
/**
 * 建立一局初始状态：球生于盘心静止，盘角 0，计时满额。
 * @param seed - 基础种子。
 * @param level - 关卡号（从 1 起）。
 * @returns 初始状态（status='playing'）。
 */
export declare function createState(seed: number, level: number): TiltMazeState;
/**
 * 步进固定数量个子步（确定性入口：同状态同输入序列结果恒一致）。
 * @param state - 状态（就地更新）。
 * @param count - 子步数。
 */
export declare function stepSubsteps(state: TiltMazeState, count: number): void;
/**
 * 步进指定时长（四舍五入到整数个子步，便于测试精确复现）。
 * @param state - 状态（就地更新）。
 * @param seconds - 时长 s。
 */
export declare function stepSeconds(state: TiltMazeState, seconds: number): void;
