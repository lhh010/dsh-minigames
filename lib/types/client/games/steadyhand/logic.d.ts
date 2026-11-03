/**
 * 电流急急棒（Steady Hand）纯逻辑：玩家捏着一枚电环沿弯曲金属轨从
 * 起点走到终点。触电判定：环心到轨道中心折线的最小距离 d 满足
 * d + 轨半径 ≥ 环孔半径（金属轨碰到环沿）即触电——环必须始终套着轨
 * 道并留有裕量；裕量 = 环孔半径 − 轨半径，关卡越高轨越粗、环越小，
 * 裕量越窄。触电 -1 命（共 3 命）并回到最近检查点（中段安全岛或
 * 起点），安全岛内免触电。通关计时：越快通关时间分越高。全部时间
 * 单位毫秒；关卡轨道由固定参数表经确定性贝塞尔采样生成，环以固定
 * 8ms 子步追指针，不含任何随机源，整局轨迹可精确复现。
 */
/** 逻辑画布尺寸（含顶部 HUD 与底部进度条区域）。 */
export declare const W = 640;
export declare const H = 440;
/** 初始生命。 */
export declare const START_LIVES = 3;
/** 关卡总数（参数表长度）。 */
export declare const LEVEL_COUNT = 5;
/** 每条贝塞尔曲线段的确定性采样点数。 */
export declare const SAMPLES_PER_SEG = 28;
/** 固定物理子步 ms：环的移动与判定都按 8ms 离散推进，保证确定性。 */
export declare const SUBSTEP_MS = 8;
/** 环追指针的最大速度 px/s。 */
export declare const RING_SPEED = 1100;
/** 触电后/开局的保护时长 ms（期间免触电判定）。 */
export declare const GRACE_MS = 500;
/** 触电红闪时长 ms。 */
export declare const FLASH_MS = 380;
/** 触电震屏时长 ms。 */
export declare const SHAKE_MS = 420;
/** 终点判定半径 px（环心进入即通关）。 */
export declare const END_R = 26;
/** 检查点（安全岛）半径 px：进入即存档且岛内免触电。 */
export declare const CHECKPOINT_R = 32;
/** 过关基础分。 */
export declare const LEVEL_BASE_SCORE = 100;
/** 时间分上限（每 100ms 递减 1 分，下限 0）。 */
export declare const TIME_BONUS_MAX = 500;
/** 一段三次贝塞尔曲线：8 个归一化坐标 (x0,y0,cx1,cy1,cx2,cy2,x3,y3)，首尾相接成链。 */
export type BezierSeg = readonly [number, number, number, number, number, number, number, number];
/** 单关参数表：贝塞尔链 + 轨半径 + 环孔半径（裕量逐关递减）。 */
export interface LevelSpec {
    /** 贝塞尔链（相邻段首尾点相同）。 */
    segs: BezierSeg[];
    /** 金属轨半厚 px。 */
    railR: number;
    /** 电环孔半径 px。 */
    holeR: number;
}
/**
 * 5 关轨道参数：越来越弯（段数递增）、越来越窄（裕量 28→12）。
 * 坐标为 0..1 归一化值，装配时乘以画布宽高。
 */
export declare const LEVEL_SPECS: readonly LevelSpec[];
/** 平面上一点。 */
export interface Pt {
    x: number;
    y: number;
}
/** 装配好的轨道：折线采样点、累计弧长、检查点与终点。 */
export interface Track {
    /** 确定性采样的折线点（像素坐标，含首尾）。 */
    points: Pt[];
    /** points[i] 的累计弧长（points[0] = 0）。 */
    cumLen: number[];
    /** 轨道总长 px。 */
    totalLen: number;
    /** 中段检查点（安全岛圆心）。 */
    checkpoint: Pt;
    /** 终点（最后一个采样点）。 */
    end: Pt;
    /** 金属轨半厚 px。 */
    railR: number;
    /** 电环孔半径 px。 */
    holeR: number;
}
/**
 * 三次贝塞尔求值（de Casteljau 展开），t∈[0,1]。
 * @param seg - 曲线段（8 数组）。
 * @param t - 参数。
 * @returns 曲线上的点。
 */
export declare function bezierAt(seg: BezierSeg, t: number): Pt;
/**
 * 装配某一关的轨道：归一化贝塞尔链 → 像素折线 + 弧长表 + 中点检查点。
 * @param level - 关卡号（1 起）。
 * @returns 轨道数据。
 */
export declare function buildTrack(level: number): Track;
/**
 * 点到线段的最小距离（投影裁剪到端点）。
 * @param px - 被测点 x。
 * @param py - 被测点 y。
 * @param ax - 线段端点 A x。
 * @param ay - 线段端点 A y。
 * @param bx - 线段端点 B x。
 * @param by - 线段端点 B y。
 * @returns 欧氏最短距离。
 */
export declare function pointSegmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number;
/**
 * 环心到轨道中心折线的最小距离。
 * @param track - 轨道。
 * @param x - 环心 x。
 * @param y - 环心 y。
 * @returns 最小距离 px。
 */
export declare function minDistanceToTrack(track: Track, x: number, y: number): number;
/**
 * 该位置的电环是否触电：环沿碰到金属轨，即 d + 轨半径 ≥ 环孔半径。
 * @param track - 轨道。
 * @param x - 环心 x。
 * @param y - 环心 y。
 * @returns true 表示触电。
 */
export declare function isShocked(track: Track, x: number, y: number): boolean;
/** 单步内产生、供渲染层消费的可视事件。 */
export type SteadyHandEvent = {
    type: 'shock';
    x: number;
    y: number;
} | {
    type: 'armed';
} | {
    type: 'checkpoint';
} | {
    type: 'clear';
    level: number;
    ms: number;
    gained: number;
} | {
    type: 'complete';
    score: number;
};
/** 一局游戏的完整可测状态。 */
export interface SteadyHandState {
    /** 全局动画时钟 ms（渲染动画用）。 */
    t: number;
    /** 本关已用时 ms（计时得分用）。 */
    levelMs: number;
    score: number;
    lives: number;
    /** 当前关卡（1 起）。 */
    level: number;
    /** 电环中心。 */
    ringX: number;
    ringY: number;
    /** 指针目标（环向其限速追踪）。 */
    targetX: number;
    targetY: number;
    /** 子步累加余量 ms（固定 8ms 子步）。 */
    acc: number;
    /** 免触电剩余 ms。 */
    graceMs: number;
    /** 红闪剩余 ms。 */
    flashMs: number;
    /** 震屏剩余 ms。 */
    shakeMs: number;
    /** 重生点（起点或已触达的检查点）。 */
    respawnX: number;
    respawnY: number;
    /** 本关是否已触达检查点。 */
    checkpointTaken: boolean;
    /** 就位阶段：false 时环尚未回到起点标记，不计时也不判触电。 */
    armed: boolean;
    /** 指针是否已离开过起点（防开局默认 target 在起点直接就位）。 */
    aimMoved: boolean;
    /** 本关沿轨进度 0..1（只增不减）。 */
    progress: number;
    /** 本次会话最快单关通关毫秒（无则 null）。 */
    bestMs: number | null;
    /** 当前关轨道。 */
    track: Track;
    events: SteadyHandEvent[];
    over: boolean;
    /** 5 关全部通关。 */
    complete: boolean;
}
/**
 * 新开一局（无随机源，同参数轨迹完全一致）。
 * @param startLevel - 起始关卡（1..5，越界收敛）。
 * @param bestMs - 跨局保留的最佳通关时间（可省略）。
 * @returns 初始状态。
 */
export declare function createSteadyHand(startLevel?: number, bestMs?: number | null): SteadyHandState;
/**
 * 指针移动：仅更新追踪目标，环在后续 step 中限速追赶。
 * @param state - 目标状态。
 * @param x - 指针逻辑坐标 x。
 * @param y - 指针逻辑坐标 y。
 */
export declare function setPointer(state: SteadyHandState, x: number, y: number): void;
/**
 * 过关得分：基础分 + 时间分（每 100ms 递减 1 分，下限 0）。
 * @param levelMs - 本关用时 ms。
 * @returns 该关得分。
 */
export declare function levelScore(levelMs: number): number;
/**
 * 推进一帧：固定 8ms 子步内环向指针限速移动，逐步判定终点、检查点、
 * 触电；触电立即处理并回到重生点。事件写入 state.events，调用方每帧
 * 消费后由本函数在下一帧开头清空。
 * @param state - 目标状态。
 * @param dtMs - 帧间隔 ms。
 */
export declare function stepSteadyHand(state: SteadyHandState, dtMs: number): void;
