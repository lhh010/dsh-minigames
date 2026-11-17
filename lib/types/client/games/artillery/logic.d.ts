/**
 * 炮台对决（Artillery）纯逻辑：侧视正弦叠加随机地形，左右各一门 3 血炮台，
 * 回合制炮击。玩家/AI 交替发射：角度 0-90 度 + 力度 1-100 决定初速，炮弹
 * 受重力与每回合 seed 决定的水平风力做抛物线飞行；命中地形炸出圆形弹坑
 * （高度场削减，后续回合地形改变），直接命中或爆心波及炮台扣 1 血，支撑
 * 被炸空的炮台滑落到新地表再扣 1 血。一回合先耗尽对方血量者胜，共 5 局
 * 记积分。AI 采用试射修正：首发带较大随机误差，之后误差逐轮减半逼近。
 * 时间单位毫秒，物理单位 px/s，同 seed 同输入逐步模拟完全确定。
 */
/** 逻辑画布尺寸（横向战场）。 */
export declare const W = 720;
export declare const H = 480;
/** 地形高度场采样数（含两端，相邻采样间距 5px）。 */
export declare const TERRAIN_SAMPLES = 145;
/** 地形采样间距 px。 */
export declare const TERRAIN_STEP = 5;
/** 炮台碰撞半径 px。 */
export declare const TURRET_R = 13;
/** 炮管长度 px（炮口出射点距转轴）。 */
export declare const BARREL_LEN = 22;
/** 炮管转轴相对炮台基座的高度 px。 */
export declare const PIVOT_DY = 14;
/** 弹坑/爆炸半径 px。 */
export declare const BLAST_R = 34;
/** 满力初速 px/s。 */
export declare const MAX_SPEED = 560;
/** 重力加速度 px/s^2。 */
export declare const GRAVITY = 420;
/** 水平风力加速度上限 px/s^2（有符号，正 = 向右吹）。 */
export declare const WIND_MAX = 90;
/** 每门炮台初始血量。 */
export declare const HP = 3;
/** 一场比赛总局数。 */
export declare const ROUNDS = 5;
/** 爆炸/脱靶后的结算展示 ms。 */
export declare const SETTLE_MS = 900;
/** AI 思考（试射修正计算）延迟 ms。 */
export declare const AI_THINK_MS = 700;
/** 一局结束后的展示 ms。 */
export declare const ROUND_OVER_MS = 1500;
/** 一局内的回合数上限（防僵局，超出判平）。 */
export declare const MAX_ROUND_TURNS = 40;
/** 玩家炮台 x。 */
export declare const P_X = 80;
/** AI 炮台 x。 */
export declare const AI_X: number;
/** AI 首发误差比例（角度 ±6 度 / 力度 ±12 的基数）。 */
export declare const AI_ERR0 = 1;
/** AI 每次试射后误差衰减系数。 */
export declare const AI_ERR_DECAY = 0.55;
/** AI 误差下限（永不完美）。 */
export declare const AI_ERR_MIN = 0.06;
/**
 * mulberry32 确定性随机数发生器。
 * @param seed - 非负整数种子。
 * @returns 返回 [0,1) 均匀随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/** 侧别：玩家在左，AI 在右。 */
export type Side = 'player' | 'ai';
/** 阶段：玩家瞄准 / 飞行 / 结算 / AI 思考 / 单局结束 / 比赛结束。 */
export type ArtilleryPhase = 'aim' | 'flying' | 'settle' | 'aiThink' | 'roundOver' | 'matchOver';
/** 单步内产生、供渲染层消费的可视事件。 */
export type ArtilleryEvent = {
    type: 'fire';
    side: Side;
    x: number;
    y: number;
} | {
    type: 'explode';
    x: number;
    y: number;
    hitTurret: Side | null;
} | {
    type: 'fall';
    side: Side;
} | {
    type: 'roundEnd';
    winner: Side | 'draw';
};
/** 一门炮台（y 为基座所在的地表高度）。 */
export interface Turret {
    x: number;
    y: number;
    hp: number;
    /** 当前炮管仰角 0-90 度（渲染与开火共用）。 */
    angle: number;
}
/** 飞行中的炮弹。 */
export interface Projectile {
    x: number;
    y: number;
    vx: number;
    vy: number;
}
/** 一场比赛的完整可测状态。 */
export interface ArtilleryState {
    seed: number;
    /** 当前第几局（1 起）。 */
    round: number;
    pointsPlayer: number;
    pointsAi: number;
    /** 高度场：每采样点的地表 y（越大越低）。 */
    terrain: number[];
    player: Turret;
    ai: Turret;
    /** 本回合水平风加速度 px/s^2（正 = 向右吹）。 */
    wind: number;
    /** 当前瞄准力度 1-100。 */
    power: number;
    turn: Side;
    phase: ArtilleryPhase;
    /** settle / roundOver 阶段剩余 ms。 */
    settleMs: number;
    /** aiThink 阶段剩余 ms。 */
    thinkMs: number;
    /** 当前局内已进行的回合数。 */
    turnCount: number;
    projectile: Projectile | null;
    /** 飞行轨迹采样点（渲染拖尾）。 */
    trail: {
        x: number;
        y: number;
    }[];
    /** AI 当前误差比例（随试射递减）。 */
    aiErrScale: number;
    /** 比赛胜负（matchOver 阶段有效）。 */
    winner: Side | 'draw' | null;
    events: ArtilleryEvent[];
    rng: () => number;
}
/**
 * 用正弦叠加生成连绵山丘高度场，并在两门炮台脚下压出平整平台。
 * @param rng - 注入的随机源。
 * @returns 长度为 TERRAIN_SAMPLES 的地表 y 数组。
 */
export declare function generateTerrain(rng: () => number): number[];
/**
 * 高度场线性插值：任意 x 处的地表 y。
 * @param terrain - 高度场。
 * @param x - 逻辑坐标 x（越界取端点）。
 * @returns 地表 y。
 */
export declare function terrainYAt(terrain: number[], x: number): number;
/**
 * 炸坑：以 (cx,cy) 为圆心、r 为半径的圆内把地表削低到圆下缘。
 * @param terrain - 高度场（就地修改）。
 * @param cx - 爆心 x。
 * @param cy - 爆心 y。
 * @param r - 弹坑半径 px。
 */
export declare function carveCrater(terrain: number[], cx: number, cy: number, r: number): void;
/**
 * 炮弹对某侧炮台的命中判定（圆形半径，炮台中心取基座上方）。
 * @param state - 当前状态。
 * @param x - 炮弹 x。
 * @param y - 炮弹 y。
 * @returns 命中的侧别，未命中返回 null。
 */
export declare function hitTurret(state: ArtilleryState, x: number, y: number): Side | null;
/**
 * 某侧发射的炮口位置与初速（角度 0-90 度自水平起算，玩家向右、AI 向左）。
 * @param t - 发射炮台。
 * @param angleDeg - 仰角度数。
 * @param power - 力度 1-100。
 * @returns 炮口坐标与初速分量。
 */
export declare function muzzleVelocity(t: Turret, side: Side, angleDeg: number, power: number): {
    x: number;
    y: number;
    vx: number;
    vy: number;
};
/**
 * 纯模拟一次发射（AI 规划与瞄准预览共用，不改动状态）。
 * @param terrain - 高度场。
 * @param t - 发射炮台。
 * @param side - 发射侧。
 * @param angleDeg - 仰角度数。
 * @param power - 力度 1-100。
 * @param wind - 水平风加速度。
 * @returns 落点（命中地形为触地 点，出界为末位置）。
 */
export declare function simulateShot(terrain: number[], t: Turret, side: Side, angleDeg: number, power: number, wind: number): {
    x: number;
    y: number;
};
/**
 * AI 试射修正：网格搜索最接近命中玩家的 (角度, 力度)，再叠加随
 * aiErrScale 线性缩小的随机误差（调用消耗 2 次随机数），并把误差
 * 比例衰减到下轮。
 * @param state - 当前状态（只读地形/目标，消耗 rng 与衰减 aiErrScale）。
 * @returns 本次发射的角度与力度。
 */
export declare function aiPlan(state: ArtilleryState): {
    angle: number;
    power: number;
};
/**
 * 新开一场比赛。
 * @param seed - 外部种子（如日期）。
 * @returns 初始状态。
 */
export declare function createArtillery(seed: number): ArtilleryState;
/**
 * 发射：按当前回合方的角度与力度射出炮弹（只在对应瞄准/思考阶段有效）。
 * @param state - 目标状态。
 * @param angleDeg - 仰角度数 0-90。
 * @param power - 力度 1-100。
 * @returns true 表示已发射。
 */
export declare function fireShot(state: ArtilleryState, angleDeg: number, power: number): boolean;
/**
 * 推进一帧：飞行物理（重力 + 风，8ms 子步防穿透）、命中判定（炮台半径
 * 优先于地形）、出界脱靶、结算计时、AI 思考后自动开火、单局与比赛流转。
 * 事件写入 state.events，调用方每帧消费后在下一帧开头清空。
 * @param state - 目标状态。
 * @param dtMs - 帧间隔 ms。
 */
export declare function stepArtillery(state: ArtilleryState, dtMs: number): void;
