/**
 * 桌上冰球（Air Hockey）纯逻辑：480×720 竖直球台，玩家推杆守下半区、
 * AI 推杆守上半区，各自底边球门宽台面 1/3。冰球是圆盘，物理为圆-圆
 * 弹性碰撞（推杆瞬时速度传入球，MALLET_E 恢复系数）、边墙反弹 0.85、
 * 指数摩擦微衰减与球速上限。进球 +1 分，先得 7 分胜一局，3 局 2 胜；
 * 每球开球由得分方发球（球静止摆在得分方半区，被推杆击出）。
 * step() 为写时复制：返回新状态、绝不改参数；给定 (seed, dt, input)
 * 完全确定（mulberry32 驱动发球位置与 AI 感知噪声）。时间单位毫秒。
 */
/** 逻辑画布宽（px）。 */
export declare const W = 480;
/** 逻辑画布高（px），顶部 HUD_H 归渲染 HUD，底部 EDGE_B 留边。 */
export declare const H = 720;
/** 顶部 HUD 条高度；球台上边缘 y = TOP。 */
export declare const HUD_H = 44;
/** 底部留边厚度；球台下边缘 y = BOT。 */
export declare const EDGE_B = 14;
/** 球场上边缘。 */
export declare const TOP = 44;
/** 球场下边缘（玩家侧球门线）。 */
export declare const BOT: number;
/** 中线 y：双方半区分界。 */
export declare const CENTER_Y: number;
/** 冰球半径。 */
export declare const PUCK_R = 15;
/** 推杆半径。 */
export declare const MALLET_R = 26;
/** 球门半宽（门宽 = W/3）。 */
export declare const GOAL_HALF: number;
/** 边墙反弹恢复系数。 */
export declare const WALL_E = 0.85;
/** 推杆-冰球碰撞恢复系数（近弹性）。 */
export declare const MALLET_E = 0.96;
/** 摩擦速率（每秒指数衰减率）。 */
export declare const FRICTION = 0.18;
/** 冰球速度上限（px/s）。 */
export declare const MAX_PUCK_SPEED = 920;
/** 玩家推杆追踪指针的速度上限（px/s）。 */
export declare const PLAYER_SPEED = 900;
/** 单局获胜分。 */
export declare const WIN_SCORE = 7;
/** 场胜局数（3 局 2 胜）。 */
export declare const GAMES_TO_WIN = 2;
/** 每球发球倒计时（ms）。 */
export declare const SERVE_MS = 800;
/** 每帧内部固定子步数（tunneling 防护）。 */
export declare const SUBSTEPS = 4;
/** 确定性 PRNG（mulberry32），32 位状态字。 */
export declare function mulberry32(seed: number): () => number;
/**
 * 显式状态字上的单步 mulberry32。
 * @param state - 当前 32 位 PRNG 状态字。
 * @returns [0,1) 均匀值与下一状态字。
 */
export declare function mulberry32Step(state: number): {
    value: number;
    next: number;
};
/** 位置向量。 */
export interface Vec {
    x: number;
    y: number;
}
/** 冰球：圆心位置与速度。 */
export interface Puck {
    x: number;
    y: number;
    vx: number;
    vy: number;
}
/** 一步的持键输入：推杆追逐目标（逻辑坐标）。 */
export interface IceHockeyInput {
    x?: number;
    y?: number;
}
/** 场胜者；对局进行中为 null。 */
export type MatchWinner = 'player' | 'ai' | null;
/** 半区归属。 */
export type Side = 'player' | 'ai';
/** AI 难度参数（随关卡提升：反应更快、更快更狠）。 */
export interface AiParams {
    /** 感知刷新间隔 ms。 */
    reactionMs: number;
    /** 移动速度上限 px/s。 */
    speed: number;
    /** 转入进攻的球速阈值 px/s。 */
    attackSpeed: number;
    /** 感知位置噪声幅度 px。 */
    jitter: number;
}
/**
 * 按关卡取 AI 参数（1..3，越界收敛）。
 * @param level - 关卡号（1 起）。
 * @returns 该关的反应/速度/进攻阈值/噪声。
 */
export declare function aiParams(level: number): AiParams;
/** 一局比赛的完整状态（含 AI 感知缓存与 PRNG 状态字）。 */
export interface IceHockeyState {
    /** 冰球。 */
    puck: Puck;
    /** 玩家推杆圆心。 */
    player: Vec;
    /** 玩家推杆追逐目标。 */
    playerTarget: Vec;
    /** AI 推杆圆心。 */
    ai: Vec;
    /** AI 当前目的地（每次感知刷新时更新）。 */
    aiTarget: Vec;
    /** AI 感知到的冰球位置（带噪声、按 reactionMs 刷新）。 */
    aiSense: Vec;
    /** 距下次 AI 感知刷新的累计毫秒。 */
    aiClock: number;
    /** 本局比分。 */
    playerScore: number;
    aiScore: number;
    /** 已胜局数。 */
    playerGames: number;
    aiGames: number;
    /** 全场累计玩家进球数（onScore 上报）。 */
    playerGoals: number;
    /** 发球倒计时剩余；>0 时冰球静止摆放。 */
    serveCd: number;
    /** 发球方（上一球的得分方）。 */
    serveSide: Side;
    /** 关卡（每打完一局 +1，封顶 3）。 */
    level: number;
    /** 场胜者。 */
    over: MatchWinner;
    /** mulberry32 状态字。 */
    rngState: number;
}
/**
 * 推杆位置夹取到己方半区与左右墙内。
 * @param x - 目标圆心 x。
 * @param y - 目标圆心 y。
 * @param side - 半区。
 * @returns 夹取后的合法圆心。
 */
export declare function clampMallet(x: number, y: number, side: Side): Vec;
/**
 * AI 决策（纯函数）：球在 AI 半区且足够慢 → 绕到球身后沿「球→对方
 * 球门」连线方向顶击；否则回防球门前横移盯球。
 * @param senseX - 感知到的球 x。
 * @param senseY - 感知到的球 y。
 * @param puckSpeed - 球真实速率（进攻模式判定用）。
 * @param level - 关卡号。
 * @returns 目的地与是否进攻。
 */
export declare function aiDecide(senseX: number, senseY: number, puckSpeed: number, level: number): {
    x: number;
    y: number;
    attack: boolean;
};
/**
 * 新建一场比赛。
 * @param seed - PRNG 种子（驱动发球位置与 AI 噪声）。
 * @param level - 起始关卡（默认 1）。
 * @returns 初始状态：玩家先发球，倒计时中。
 */
export declare function createState(seed?: number, level?: number): IceHockeyState;
/**
 * 推杆-冰球圆-圆碰撞（就地改写冰球）：先沿法线分离到接触距离，再对
 * 相对法向速度做近弹性反弹——静止推杆按恢复系数反弹来球，运动推杆
 * 把自身法向速度传进球（推得越快球飞得越快）。
 * @param puck - 冰球（会被改写）。
 * @param m - 推杆圆心与瞬时速度。
 * @returns 是否发生碰撞。
 */
export declare function collideMalletPuck(puck: Puck, m: {
    x: number;
    y: number;
    vx: number;
    vy: number;
}): boolean;
/**
 * 边墙与球门判定（就地改写冰球）：左右墙永远按 WALL_E 反弹；上下边
 * 在球门开口内放行（整球越线即进球），开口外按 WALL_E 反弹。
 * @param puck - 冰球（会被改写）。
 * @returns 进球归属得分方（'player' = 攻破上方球门），未进球为 null。
 */
export declare function resolveEdges(puck: Puck): Side | null;
/**
 * 推进一帧（写时复制；内部固定 SUBSTEPS 子步防穿透）。
 * @param state - 当前状态（不会被改写）。
 * @param dt - 帧时长 ms（>50 按 50 处理）。
 * @param input - 玩家推杆追逐目标（逻辑坐标，可为空）。
 * @returns 新状态；已终场的状态原样返回。
 */
export declare function step(state: IceHockeyState, dt: number, input: IceHockeyInput): IceHockeyState;
