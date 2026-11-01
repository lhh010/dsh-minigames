/**
 * 飞刀转盘（Knife Ring）纯逻辑：圆形木盘绕中心轴旋转，玩家点击/空格
 * 从正上方插刀，插中当前转盘角度处；与已有刀的环上角度差小于最小间隔
 * 即碰刀失败 -1 命（共 3 命），成功则钉在盘上随盘旋转。每关需插
 * N 把刀（N 递增），插满进入下一关（角速度更快、允许间隔更小、偶有
 * 预置障碍刀）。角速度曲线由 seed+关卡经 mulberry32 确定性生成为分段
 * 恒速段（高关卡随机变速/换向）。时间单位毫秒，角度单位弧度。
 */
/** 逻辑画布尺寸（HUD 条包含在该高度内）。 */
export declare const W = 480;
export declare const H = 600;
/** 转盘中心。 */
export declare const CENTER_X = 240;
export declare const CENTER_Y = 330;
/** 转盘半径 px。 */
export declare const RING_R = 150;
/** 刀柄（刀刃入盘点）到中心的半径 px。 */
export declare const KNIFE_R = 128;
/** 初始生命。 */
export declare const START_LIVES = 3;
/** 插刀下落动画时长 ms。 */
export declare const THROW_MS = 130;
/** 关卡完成停顿 ms。 */
export declare const LEVEL_BREAK_MS = 900;
/** 失败抖动时长 ms。 */
export declare const FAIL_SHAKE_MS = 420;
/** 每把刀得分。 */
export declare const KNIFE_SCORE = 10;
/** 过关奖励分。 */
export declare const LEVEL_SCORE = 50;
/**
 * mulberry32 确定性随机数发生器。
 * @param seed - 非负整数种子。
 * @returns 返回 [0,1) 均匀随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/**
 * 第 level 关需要插的刀数：4 把起步，每关 +1，封顶 12。
 * @param level - 关卡号（从 1 开始）。
 * @returns 该关需插刀数。
 */
export declare function knivesFor(level: number): number;
/**
 * 第 level 关允许的最小角间隔 rad：从 0.52 递减到下限 0.30。
 * @param level - 关卡号。
 * @returns 两刀不判碰撞的最小角间隔。
 */
export declare function minGapFor(level: number): number;
/**
 * 第 level 关是否预置障碍刀（每 3 关出现，第 3、6、9……关）。
 * @param level - 关卡号。
 * @returns true 时该关开局在盘上预置 1~2 把障碍刀。
 */
export declare function hasObstacles(level: number): boolean;
/** 一段恒定角速度：持续 durMs 毫秒、角速度 omega rad/s（正为顺时针）。 */
export interface SpeedSegment {
    durMs: number;
    omega: number;
}
/** 段间过渡的角加速度上限 rad/s²——变速/换向不再瞬跳，全程 300-700ms
 * 可见的减速-加速过程，玩家有反应窗口读节奏。 */
export declare const OMEGA_RAMP = 6;
/**
 * 生成某关的角速度曲线：3 段起步，关卡升高段数增多、速度更快；
 * 第 2 关起每段有概率换向（变速+换向增加难度）。纯确定性。
 * @param rng - 该关的随机源。
 * @param level - 关卡号。
 * @returns 分段恒速曲线（循环播放）。
 */
export declare function buildSpeedCurve(rng: () => number, level: number): SpeedSegment[];
/** 一把钉在盘上的刀：angleRad 为相对盘面的固有角度。 */
export interface PinnedKnife {
    angle: number; /** true 表示关卡开局预置的障碍刀。 */
    obstacle: boolean;
}
/** 单步内产生、供渲染层消费的可视事件。 */
export type KnifeEvent = {
    type: 'stick';
    angle: number;
} | {
    type: 'hit';
    angle: number;
} | {
    type: 'level';
    level: number;
};
/** 一局游戏的完整可测状态。 */
export interface KnifeRingState {
    /** 回合内已流逝 ms。 */
    t: number;
    score: number;
    lives: number;
    /** 当前关卡（从 1 开始）。 */
    level: number;
    /** 盘面当前朝向 rad（相对初始 0；插刀落点 = angleAtThrow 的盘面固有角）。 */
    ringAngle: number;
    /** 当前关的分段速度曲线（循环）。 */
    curve: SpeedSegment[];
    /** 当前所处段索引与段内已流逝 ms。 */
    segIndex: number;
    segMs: number;
    /** 当前实际角速度（向目标段速度限加速度缓动，消除瞬跳）。 */
    omegaCur: number;
    /** 已钉在盘上的刀（含预置障碍刀）。 */
    knives: PinnedKnife[];
    /** 当前关仍需插的刀数。 */
    remaining: number;
    /** 下落的刀（动画期间不接受新的插刀）：targetAngle 为盘面固有角。 */
    throwing: {
        targetAngle: number;
        ms: number;
    } | null;
    /** 关卡完成停顿剩余 ms。 */
    breakMs: number;
    /** 失败抖动剩余 ms。 */
    shakeMs: number;
    events: KnifeEvent[];
    over: boolean;
}
/**
 * 新开一局：同 seed 同 round 的整局轨迹完全一致。
 * @param seed - 外部种子（如日期）。
 * @param round - 第几局（同 seed 不同局轨迹不同）。
 * @returns 初始状态。
 */
export declare function createKnifeRing(seed: number, round?: number): KnifeRingState;
/**
 * 尝试插刀：空闲时记录当前落点并进入下落动画（判定在动画结束时进行，
 * 保证确定性：落点取按下瞬间的盘面固有角）。动画中/停顿中/结束时忽略。
 * @param state - 目标状态。
 */
export declare function throwKnife(state: KnifeRingState): void;
/**
 * 推进一帧：转盘旋转（分段速度曲线）、插刀动画、碰刀判定、过关切换。
 * 事件写入 state.events，调用方每帧消费后由本函数在下一帧开头清空。
 * @param state - 目标状态。
 * @param dtMs - 帧间隔 ms。
 */
export declare function stepKnifeRing(state: KnifeRingState, dtMs: number): void;
/**
 * 过关停顿结束时装配下一关（转盘随机源仍来自关卡派生种子，保持确定性）。
 * 与 createKnifeRing 的装配不同：这里用 seed+level 派生，便于单关复现。
 * @param state - 目标状态。
 * @param seed - 本局种子。
 */
export declare function beginNextLevel(state: KnifeRingState, seed: number): void;
