/**
 * 重力翻转（Gravity Flip）纯逻辑：横版自动前进跑酷。角色固定在屏幕
 * PLAYER_X 处，世界以随距离递增的速度向左滚动；一次翻转输入反转重力
 * 方向，角色在地板与天花板两条轨道之间下坠并贴附到当前重力侧。障碍由
 * seed+段号确定性生成：地面 / 天花板尖刺、带窄窗的屏障墙（需空中二连
 * 翻微调才能穿过）、按固定周期相位发射的垂直激光。撞尖刺 / 屏障 / 发射
 * 中的激光即死；距离即分数。物理按固定 SUBSTEP_MS 子步推进（累积器
 * 模式），同种子同输入完全可重放。时间单位毫秒，物理单位 px / s。
 */
/** 逻辑画布尺寸（横版走廊）。 */
export declare const W = 720;
export declare const H = 320;
/** 上下发光轨道的厚度：天花板下缘 y=CEIL_BOT，地板上缘 y=FLOOR_TOP。 */
export declare const TRACK = 26;
export declare const CEIL_BOT = 26;
export declare const FLOOR_TOP: number;
/** 角色固定屏幕横坐标（世界滚动，角色不动）。 */
export declare const PLAYER_X = 150;
/** 角色渲染半宽 / 半高。 */
export declare const PLAYER_HW = 8;
export declare const PLAYER_HH = 11;
/** 角色判定半宽 / 半高（略小于外观，判定宽容）。 */
export declare const HIT_HW = 7;
export declare const HIT_HH = 9;
/** 重力加速度 px/s^2（两侧同值）。 */
export declare const G = 2300;
/** 滚动速度：随距离线性递增并封顶。 */
export declare const SPEED_BASE = 250;
export declare const SPEED_GAIN = 0.03;
export declare const SPEED_MAX = 540;
/** 固定物理子步 ms（确定性保证）。 */
export declare const SUBSTEP_MS = 8;
/** 尖刺带高度与单个尖刺宽度。 */
export declare const SPIKE_H = 26;
export declare const SPIKE_W = 18;
/** 屏障墙厚度。 */
export declare const BARRIER_W = 16;
/** 屏障窗口最小高度（生成器保证可通过）。 */
export declare const MIN_WINDOW = 110;
/** 激光参数：周期 / 发射时长 / 预警时长 / 光束宽 / 覆盖高度。 */
export declare const LASER_PERIOD = 2100;
export declare const LASER_FIRE_MS = 520;
export declare const LASER_WARN_MS = 600;
export declare const LASER_W = 7;
export declare const LASER_H = 120;
/** 障碍段长度（世界坐标，按段号生成）。 */
export declare const SEG_LEN = 300;
/** 翻转旋转动画时长 ms（渲染层用）。 */
export declare const FLIP_ANIM_MS = 220;
/**
 * mulberry32 确定性随机数发生器。
 * @param seed - 非负整数种子。
 * @returns 返回 [0,1) 均匀随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/**
 * 当前滚动速度 px/s：随距离线性递增并封顶。
 * @param dist - 已滚动距离 px。
 * @returns 当前速度。
 */
export declare function speedOf(dist: number): number;
/** 障碍物（世界坐标）。 */
export type Obstacle = {
    type: 'spikes';
    side: 'bottom' | 'top';
    x1: number;
    x2: number;
} | {
    type: 'barrier';
    x: number;
    oy1: number;
    oy2: number;
} | {
    type: 'laser';
    x: number;
    side: 'bottom' | 'top';
    phase: number;
};
/** 单步内产生、供渲染层消费的可视事件。 */
export type GravFlipEvent = {
    type: 'flip';
} | {
    type: 'die';
    x: number;
    y: number;
    cause: 'spikes' | 'barrier' | 'laser';
};
/** 残影采样点（渲染层按序淡出绘制）。 */
export interface TrailPoint {
    y: number;
    dir: number;
}
/** 一局游戏的完整可测状态（纯数据，可结构化克隆）。 */
export interface GravFlipState {
    /** 回合内已流逝 ms（激光相位钟）。 */
    t: number;
    seed: number;
    /** 已滚动距离 px（世界坐标基准）。 */
    dist: number;
    /** 分数 = floor(dist / 10)。 */
    score: number;
    /** 重力方向：1 = 向下（地板），-1 = 向上（天花板）。 */
    dir: number;
    /** 角色中心 y。 */
    y: number;
    vy: number;
    phase: 'running' | 'dead';
    /** 死因（死亡时写入）。 */
    cause: 'spikes' | 'barrier' | 'laser' | null;
    /** 距上次翻转的 ms（渲染旋转动画）。 */
    flipT: number;
    /** 固定子步累积器 ms。 */
    acc: number;
    /** 已生成到的段号（不含）。 */
    genIndex: number;
    /** 当前活跃障碍（已裁剪过期段）。 */
    obstacles: Obstacle[];
    events: GravFlipEvent[];
    trail: TrailPoint[];
}
/**
 * 生成某段的障碍（seed+段号确定性）。前两段留空作起步缓冲；之后按
 * 随机权重生成尖刺带 / 激光 / 带窗屏障，屏障窗口高度与位置满足可通过
 * 保证（高 ≥ MIN_WINDOW，中心处于走廊中部可达带内）。
 * @param seed - 外部种子。
 * @param index - 段号（从 0 起）。
 * @returns 该段障碍列表（可能为空）。
 */
export declare function genSegment(seed: number, index: number): Obstacle[];
/**
 * 激光在时刻 t 是否处于发射态（相位决定错峰）。
 * @param t - 回合内时刻 ms。
 * @param phase - 该激光的相位偏移 ms。
 * @returns true 表示正在发射。
 */
export declare function laserFiring(t: number, phase: number): boolean;
/**
 * 激光在时刻 t 是否处于预警态（即将发射）。
 * @param t - 回合内时刻 ms。
 * @param phase - 该激光的相位偏移 ms。
 * @returns true 表示预警中。
 */
export declare function laserWarn(t: number, phase: number): boolean;
/**
 * 角色当前世界横坐标。
 * @param state - 当前状态。
 * @returns 世界 x。
 */
export declare function playerWorldX(state: GravFlipState): number;
/**
 * 角色判定盒是否与某障碍相撞（激光仅在发射态判定）。
 * @param state - 当前状态。
 * @param ob - 待检测障碍。
 * @returns true 表示命中。
 */
export declare function hitObstacle(state: GravFlipState, ob: Obstacle): boolean;
/**
 * 新开一局：角色贴地板起跑。
 * @param seed - 外部种子。
 * @returns 初始状态。
 */
export declare function createGravFlip(seed: number): GravFlipState;
/**
 * 推进一帧：把 dtMs 攒进累积器，按固定 8ms 子步确定性推进（翻转只在
 * 首个子步生效一次）；每个子步内完成重力、滚动、贴附、障碍生成与碰撞。
 * @param state - 目标状态。
 * @param dtMs - 帧间隔 ms（超量部分按子步粒度处理，不撕裂物理）。
 * @param flipPressed - 本帧是否按下了翻转。
 */
export declare function stepGravFlip(state: GravFlipState, dtMs: number, flipPressed: boolean): void;
