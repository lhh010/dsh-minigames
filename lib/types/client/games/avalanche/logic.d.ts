/**
 * 滑雪大冒险（Avalanche）纯逻辑：Ski Safari 式横版逃亡。玩家沿起伏雪坡
 * 向右持续加速下滑（地形由 seed+段号确定性生成，段内折线起伏并随机出现
 * 跳台凸起），身后雪崩墙以略低于玩家满速的速度推进；撞岩石/树会翻滚
 * 减速（雪崩追近），↑/空格起跳（跳台上更高），空中 ←→ 控制姿态，落地
 * 姿态过倾则翻滚；空中滞空超过阈值自动计翻滚特技 +50/次；坡上随机出现
 * 企鹅（加速+一次免撞）与雪人（两次免撞）可骑乘，被撞掉后可再捡；沿途
 * 金币 +10。玩家与雪崩墙距离 < 0 即结束。时间单位 ms，物理单位 px/s，
 * 同 seed 同输入逐步模拟完全确定。
 */
/** 逻辑画布尺寸（横版卷轴）。 */
export declare const W = 960;
export declare const H = 540;
/** 玩家在屏幕上的固定位置。 */
export declare const PLAYER_X = 220;
export declare const PLAYER_Y = 300;
/** 玩家碰撞半径。 */
export declare const PLAYER_R = 12;
/** 每段地形的世界宽度 px（段号 i 覆盖世界 x ∈ [i*SEG_W, (i+1)*SEG_W)）。 */
export declare const SEG_W = 600;
/** 段内折线采样间距 px。 */
export declare const STEP = 60;
/** 第 0 段起点的世界 y。 */
export declare const START_Y = 210;
/** 基础坡降（每 px 世界 y 增量，正 = 下坡加速）。 */
export declare const BASE_SLOPE = 0.3;
/** 段内起伏幅度 px。 */
export declare const WOBBLE = 34;
/** 跳台凸起高度 px。 */
export declare const RAMP_H = 74;
/** 跳台判定半径 px（在此范围内起跳获得更高初速）。 */
export declare const RAMP_RADIUS = 100;
/** 重力加速度 px/s^2（y 向下为正）。 */
export declare const GRAVITY = 1500;
/** 普通起跳初速 px/s。 */
export declare const JUMP_V = 430;
/** 跳台额外起跳初速 px/s。 */
export declare const RAMP_BOOST = 300;
/** 撞击/翻滚后的最低回复速度 px/s。 */
export declare const MIN_SPEED = 140;
/** 速度回复加速度 px/s^2。 */
export declare const RECOVER_ACCEL = 280;
/** 基础满速 px/s。 */
export declare const BASE_MAX_SPEED = 360;
/** 骑企鹅的满速加成 px/s。 */
export declare const PENGUIN_BONUS = 80;
/** 骑雪人的满速加成 px/s。 */
export declare const YETI_BONUS = 20;
/** 坡度→加速度系数（vx += grade*SLOPE_ACCEL*dt）。 */
export declare const SLOPE_ACCEL = 900;
/** 雪崩基础速度 px/s（低于玩家基础满速）。 */
export declare const AVA_BASE_SPEED = 332;
/** 雪崩每前进这么多 px 提速一次。 */
export declare const AVA_GROW_DIST = 6000;
/** 雪崩每次提速增量 px/s。 */
export declare const AVA_GROW = 10;
/** 雪崩速度上限 px/s。 */
export declare const AVA_MAX_SPEED = 392;
/** 开局雪崩墙在玩家身后的距离 px。 */
export declare const AVA_START_GAP = 900;
/** 撞障碍后的速度保留比例。 */
export declare const CRASH_VX_KEEP = 0.42;
/** 翻滚失控时长 ms。 */
export declare const TUMBLE_MS = 750;
/** 撞击后的无敌宽限 ms（避免连环判定）。 */
export declare const CRASH_GRACE_MS = 900;
/** 空中姿态旋转速率 rad/s。 */
export declare const ROT_SPEED = 4.2;
/** 空中姿态最大倾角 rad。 */
export declare const MAX_TILT = 1.5;
/** 落地安全倾角上限 rad（超过则翻滚）。 */
export declare const LAND_TILT_MAX = 1.05;
/** 计入特技的最短滞空 ms。 */
export declare const TRICK_MIN_MS = 750;
/** 每多翻一次的滞空增量 ms。 */
export declare const FLIP_MS = 450;
/** 每次翻滚特技得分。 */
export declare const TRICK_SCORE = 50;
/** 每枚金币得分。 */
export declare const COIN_SCORE = 10;
/** 飘字存活时长 ms。 */
export declare const FLOAT_MS = 900;
/** 距离换算：10px 记 1 米 / 1 分。 */
export declare const DIST_UNIT = 10;
/**
 * mulberry32 确定性随机数发生器。
 * @param seed - 非负整数种子。
 * @returns 返回 [0,1) 均匀随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/** 阶段：滑行逃亡 / 一局结束。 */
export type AvaPhase = 'run' | 'over';
/** 骑乘状态：无 / 企鹅 / 雪人。 */
export type MountKind = 'none' | 'penguin' | 'yeti';
/** 障碍种类：树 / 岩石。 */
export type ObstacleKind = 'tree' | 'rock';
/** 单步内产生、供渲染层消费的可视事件（世界坐标）。 */
export type AvaEvent = {
    type: 'jump';
    x: number;
    y: number;
} | {
    type: 'land';
    x: number;
    y: number;
} | {
    type: 'crash';
    x: number;
    y: number;
} | {
    type: 'shield';
    x: number;
    y: number;
} | {
    type: 'coin';
    x: number;
    y: number;
} | {
    type: 'trick';
    x: number;
    y: number;
    gained: number;
} | {
    type: 'mount';
    x: number;
    y: number;
    kind: MountKind;
} | {
    type: 'over';
    x: number;
    y: number;
};
/** 一个障碍（世界坐标，坐落于坡面上）。 */
export interface AvaObstacle {
    x: number;
    kind: ObstacleKind;
    /** 碰撞半径。 */
    r: number;
}
/** 一枚金币（世界坐标，悬浮于坡面上方）。 */
export interface AvaCoin {
    x: number;
    y: number;
    taken: boolean;
}
/** 一个可骑乘伙伴（世界坐标，坐落于坡面上）。 */
export interface AvaMount {
    x: number;
    kind: Exclude<MountKind, 'none'>;
    taken: boolean;
}
/**
 * 一段地形：起点世界 y、按 STEP 采样的折线高度（含段尾共享点）、可选
 * 跳台（rampK 为折线索引，-1 表示无）、障碍/金币/伙伴。
 */
export interface AvaSegment {
    index: number;
    /** 段起点（折线第 0 点）的世界 y。 */
    startY: number;
    /** 折线高度，长度 SEG_W/STEP + 1，末点即下一段起点。 */
    heights: number[];
    /** 跳台中心折线索引，-1 表示本段无跳台。 */
    rampK: number;
    obstacles: AvaObstacle[];
    coins: AvaCoin[];
    mounts: AvaMount[];
}
/** 上浮渐隐的飘字（世界坐标）。 */
export interface AvaFloat {
    x: number;
    y: number;
    text: string;
    life: number;
}
/** 一局游戏的完整可测状态。 */
export interface AvaState {
    /** 回合内已流逝 ms。 */
    t: number;
    seed: number;
    phase: AvaPhase;
    /** 玩家世界坐标（y 向下为正）。 */
    px: number;
    py: number;
    /** 水平速度 px/s 与垂直速度 px/s。 */
    vx: number;
    vy: number;
    /** 是否在坡面上。 */
    onGround: boolean;
    /** 本轮滞空累计 ms。 */
    airMs: number;
    /** 空中姿态倾角 rad（正 = 前仰）。 */
    tilt: number;
    /** 剩余翻滚失控 ms。 */
    tumbleMs: number;
    /** 撞击后无敌剩余 ms。 */
    crashGraceMs: number;
    /** 当前骑乘与剩余免撞次数。 */
    mount: MountKind;
    shields: number;
    coinScore: number;
    trickScore: number;
    /** 雪崩墙前沿的世界 x。 */
    avalancheX: number;
    events: AvaEvent[];
    floats: AvaFloat[];
    /** 已生成的地形段，按段号索引。 */
    segments: Map<number, AvaSegment>;
    /** 已连续生成到的最大段号（地形按序生成以保证折线连续）。 */
    maxSeg: number;
}
/** 每帧输入：跳跃为边沿触发（本帧按下），空中 ←→ 控制姿态。 */
export interface AvaInput {
    jump: boolean;
    left: boolean;
    right: boolean;
}
/** 空闲输入（不放任何键）。 */
export declare const IDLE_INPUT: AvaInput;
/**
 * 在一段已生成的折线上取世界 x 处的地面 y（线性插值；x 超出段范围时
 * 钳到段两端）。
 * @param seg - 目标段。
 * @param worldX - 世界 x。
 * @returns 地面世界 y。
 */
export declare function segmentGroundY(seg: AvaSegment, worldX: number): number;
/**
 * 确定性生成一段地形：折线起伏（末点落在趋势线上保证与下一段连续）、
 * 可选跳台凸起、随段号递增的障碍（开局 0~1 个热身，20 段后 2~5 个）、
 * 一组金币、偶发一个骑乘伙伴。
 * @param seed - 一局种子。
 * @param index - 段号（≥0）。
 * @param startY - 段起点世界 y（= 上一段末点）。
 * @returns 该段地形。
 */
export declare function generateSegment(seed: number, index: number, startY: number): AvaSegment;
/**
 * 新开一局：玩家立于世界原点坡面上，雪崩墙在身后 AVA_START_GAP px。
 * @param seed - 外部种子（如日期+局号）。
 * @returns 初始状态（含首屏地形段）。
 */
export declare function createAvalanche(seed: number): AvaState;
/**
 * 取世界 x 处的地面 y（自动生成所需段）。
 * @param state - 目标状态。
 * @param worldX - 世界 x。
 * @returns 地面世界 y。
 */
export declare function groundYAt(state: AvaState, worldX: number): number;
/**
 * 取世界 x 处的坡度（dy/dx，正 = 下坡）。
 * @param state - 目标状态。
 * @param worldX - 世界 x。
 * @returns 坡度。
 */
export declare function gradeAt(state: AvaState, worldX: number): number;
/**
 * 当前满速（含骑乘加成）。
 * @param state - 当前状态。
 * @returns 满速 px/s。
 */
export declare function maxSpeed(state: AvaState): number;
/**
 * 玩家与雪崩墙的距离（px，正 = 安全余量）。
 * @param state - 当前状态。
 * @returns 距离。
 */
export declare function avalancheGap(state: AvaState): number;
/**
 * 推进一帧：坡度加速与速度恢复、起跳（跳台更高）、空中姿态与重力、
 * 落地判定（特技计分 + 姿态检查）、障碍碰撞（骑乘抵消/翻滚）、金币与
 * 伙伴拾取、雪崩推进与追尾结束。事件写入 state.events，调用方每帧消费。
 * @param state - 目标状态。
 * @param dtMs - 帧间隔 ms。
 * @param input - 本帧输入（jump 为本帧按下）。
 */
export declare function stepAvalanche(state: AvaState, dtMs: number, input: AvaInput): void;
/**
 * 总分 = 距离分（每 10px 1 分）+ 金币分 + 特技分。
 * @param state - 当前状态。
 * @returns 总分。
 */
export declare function totalScore(state: AvaState): number;
/**
 * 当前已滑距离（米，HUD 用）：10px 记 1 米。
 * @param state - 当前状态。
 * @returns 距离米数。
 */
export declare function displayDistance(state: AvaState): number;
