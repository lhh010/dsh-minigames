/**
 * 转碟杂技（Plates）纯逻辑：舞台上最多 6 根长杆，每杆顶一只碟子；
 * 碟子转速（0..1）按每秒 0.09 自然衰减，转速低于 0.25 开始摇晃（视觉
 * 预警，由渲染层按转速推导），归零即掉落并损失 1 命（共 3 命）。玩家
 * 控制杂技演员左右移动，按空格为距自己最近的碟子补转（+0.5、封顶 1，
 * 1 秒点击式冷却）。场上目标碟子数随存活时间每 15 秒 +1（封顶 6），
 * 掉落后下一帧补回目标数。得分为每秒 10 × 场上碟子数（帧内小数累积、
 * 取整上报）。3 命耗尽结束。所有随机走注入 seed（mulberry32），同
 * seed + 同输入序列重放一致。时间单位毫秒。
 */
/** 逻辑画布尺寸。 */
export declare const W = 480;
export declare const H = 640;
/** 长杆顶部 y（碟面高度）。 */
export declare const POLE_TOP_Y = 210;
/** 长杆底部 y（舞台地面）。 */
export declare const POLE_BASE_Y = 560;
/** 左右留白：第 0 根与第 5 根杆的 x。 */
export declare const SLOT_MARGIN = 58;
/** 转速自然衰减 / 秒。 */
export declare const DECAY_PER_S = 0.09;
/** 低于该转速开始摇晃（视觉预警阈值）。 */
export declare const WOBBLE_SPIN = 0.25;
/** 单次补转增量。 */
export declare const SPIN_ADD = 0.5;
/** 转速上限。 */
export declare const SPIN_MAX = 1;
/** 补转冷却 ms（点击式）。 */
export declare const SPIN_CD_MS = 1000;
/** 每存活多少 ms 目标碟子数 +1。 */
export declare const ADD_PLATE_MS = 15000;
/** 场上碟子数上限（也是杆位槽位数）。 */
export declare const MAX_PLATES = 6;
/** 初始生命。 */
export declare const START_LIVES = 3;
/** 每秒每碟基础得分。 */
export declare const SCORE_PER_S = 10;
/** 演员横向移动速度 px/s。 */
export declare const PLAYER_SPEED = 260;
/** 演员横向活动范围（相对左右留白）。 */
export declare const PLAYER_MARGIN = 40;
/** 新碟出生转速下限（上限为 SPIN_MAX）。 */
export declare const SPAWN_SPIN_MIN = 0.85;
/**
 * mulberry32 确定性随机数发生器。
 * @param seed - 非负整数种子。
 * @returns 返回 [0,1) 均匀随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/** 一只转着的碟子：slot 为杆位槽（0..MAX_PLATES-1）。 */
export interface Plate {
    /** 杆位槽下标。 */
    slot: number;
    /** 转速 0..1。 */
    spin: number;
    /** 旋转相位（视觉用，随转速积分）。 */
    phase: number;
    /** 配色索引（稳定取共享主题色阶）。 */
    hue: number;
}
/** 单步内产生、供渲染层消费的可视事件。 */
export type PlatesEvent = {
    type: 'spin';
    x: number;
    y: number;
    hue: number;
} | {
    type: 'deny';
    x: number;
    y: number;
} | {
    type: 'drop';
    x: number;
    hue: number;
} | {
    type: 'spawn';
    x: number;
    hue: number;
};
/** 一帧输入：左右按住状态 + 本帧是否按下补转。 */
export interface PlatesInput {
    left: boolean;
    right: boolean;
    spin: boolean;
}
/** 一局游戏的完整可测状态。 */
export interface PlatesState {
    /** 回合内已流逝 ms。 */
    t: number;
    /** 取整后的展示得分（真实累积在 scoreAcc）。 */
    score: number;
    /** 帧内小数累积的得分（导出以便测试精确断言）。 */
    scoreAcc: number;
    lives: number;
    dropped: number;
    /** 场上碟子（含槽位）。 */
    plates: Plate[];
    /** 演员中心 x。 */
    playerX: number;
    /** 补转冷却剩余 ms。 */
    cooldownLeft: number;
    events: PlatesEvent[];
    rng: () => number;
    /** 已使用的配色索引计数（保证新碟颜色稳定递进）。 */
    hueCount: number;
    over: boolean;
}
/**
 * 第 i 根杆的 x 坐标（槽位均匀横排）。
 * @param i - 槽位下标 0..MAX_PLATES-1。
 * @returns 杆中心 x。
 */
export declare function slotX(i: number): number;
/**
 * 当前目标碟子数：1 + floor(t / ADD_PLATE_MS)，封顶 MAX_PLATES。
 * @param tMs - 回合内毫秒钟。
 * @returns 目标碟子数。
 */
export declare function plateTargetOf(tMs: number): number;
/**
 * 碟子是否处于摇晃预警区间（转速低于 WOBBLE_SPIN 且未归零）。
 * @param plate - 待判定的碟子。
 * @returns true 表示需要摇晃预警。
 */
export declare function isWobbling(plate: Plate): boolean;
/**
 * 距演员最近的一只碟子（补转作用目标）。
 * @param state - 当前状态。
 * @returns 最近的碟子，场上无碟时为 null。
 */
export declare function nearestPlate(state: PlatesState): Plate | null;
/**
 * 演员横向活动范围。
 * @returns [minX, maxX]。
 */
export declare function playerRange(): [number, number];
/**
 * 新开一局。
 * @param seed - 外部种子（如日期）。
 * @param round - 第几局（同一 seed 的不同局轨迹不同）。
 * @returns 初始状态（含 1 只起始碟）。
 */
export declare function createPlates(seed: number, round?: number): PlatesState;
/** 一帧的空输入常量（idle 推进）。 */
export declare const IDLE_INPUT: PlatesInput;
/**
 * 推进一帧：演员移动 → 冷却递减 → 结算补转（最近碟 +0.5，冷却中拒绝）
 * → 转速衰减与相位积分（归零掉落扣命）→ 补碟到目标数（每帧最多 1 个）
 * → 得分累积（10 × 碟数 / 秒）。事件写入 state.events，调用方每帧消费
 * 后在下一帧开头被清空。
 * @param state - 目标状态。
 * @param dtMs - 帧间隔 ms。
 * @param input - 本帧输入。
 */
export declare function stepPlates(state: PlatesState, dtMs: number, input: PlatesInput): void;
