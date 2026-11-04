/**
 * 手忙脚乱 QWOP 纯逻辑：简化双足"角度弹簧-阻尼"跑步模型——躯干是一
 * 个倒立摆（起跑带前倾、放着不管必然前扑），Q/W 分别给左/右大腿施加
 * 相对躯干的力矩，O/P 分别给左/右小腿施加力矩。脚触地产生支撑（弹
 * 簧+阻尼）：支撑脚在髋前方会把躯干向后顶（救跌），落到髋后方则推
 * 身体前进；O/P 在该脚触地时向下蹬地（竖直蹬伸=小跳，卸掉另一脚才
 * 能摆腿）；触地腿摆动受限（有摩擦）。躯干超角、膝盖触地或头触地即
 * 摔倒，前进距离（米）即分数，跑满 50 m 过线。固定 4 ms 子步 + 帧间
 * 时间累加器：任意帧间隔输入下模拟序列完全确定、可精确重放。世界坐
 * 标 y 向上为正、地面为 y=0，x 正向为跑动方向；长度单位米，时间单位
 * 毫秒（子步内部换算为秒）。
 */
/** 逻辑画布尺寸（渲染层用）。 */
export declare const W = 720;
export declare const H = 420;
/** 过线目标距离（米）。 */
export declare const GOAL_M = 50;
/** 固定物理子步毫秒数。 */
export declare const SUB_MS = 4;
/** 大腿长度（米）。 */
export declare const L_THIGH = 0.44;
/** 小腿长度（米）。 */
export declare const L_CALF = 0.44;
/** 躯干长度（髋到头，米）。 */
export declare const L_TORSO = 0.62;
/** 起跑髋高（微屈膝站立，米）。 */
export declare const START_HIP_Y = 0.82;
/** 双腿伸直时的髋高上限（米）。 */
export declare const MAX_HIP_Y: number;
/** 起跑躯干前倾角（rad）——不控就会越扑越深。 */
export declare const START_TORSO = 0.28;
/** 重力加速度（m/s^2）。 */
export declare const G = 9.8;
/** 躯干倒立摆失稳系数（越大越快前扑）。 */
export declare const TORSO_INSTAB = 4.6;
/** 躯干角速度阻尼（每秒衰减比例，抑制救跌后的往复过冲）。 */
export declare const TORSO_DAMP = 1.5;
/** 大腿摆位随躯干前倾的跟随系数（0 = 完全竖垂，1 = 完全随躯干）。 */
export declare const LEG_FOLLOW = 0.05;
/** 步幅线系数：当前前倾下"平衡支撑点"在髋前 sin(躯干角)·STRIDE_AHEAD 处。 */
export declare const STRIDE_AHEAD = 0.25;
/** 落在步幅线之前的脚对躯干转动的吸收系数（只刹不反推——迈一步接住
 * 前扑的躯干，这正是 QWOP 里 Q/W 抢救的本能动作）。 */
export declare const K_ABSORB = 40;
/** 步幅线位置的弱回正系数（rad/s^2 每米偏移，双向小量）。 */
export declare const K_BACK = 6;
/** 躯干前倾本身的推进系数（前倾带步）。 */
export declare const K_LEAN_DRIVE = 4;
/** 支撑脚落到髋后方的推进系数（每米偏移的加速度）。 */
export declare const K_STANCE = 36;
/** O/P 蹬地竖直加速度（m/s^2，把身体蹬离地面才能摆另一条腿）。 */
export declare const K_KICK = 55;
/** 触地支撑弹簧系数。 */
export declare const K_SUPPORT = 320;
/** 触地时垂直速度阻尼（每秒衰减比例）。 */
export declare const C_SUPPORT = 8;
/** 触地腿摆动阻尼（每秒衰减比例，腿钉在地上摆不动）。 */
export declare const C_STANCE_SWING = 4;
/** 触地脚"钉桩"系数：脚被钉在落地点，髋越过桩点时腿被几何拉着后旋
 * （身体从支撑脚上方跨越过去——这才是跑步的招牌动作）。 */
export declare const K_FOOT_PIN = 60;
/** 触地水平摩擦（每秒衰减比例）。 */
export declare const FRICTION = 1.8;
/** 空气水平阻力（每秒衰减比例）。 */
export declare const AIR_DRAG = 0.25;
/** 水平速度上限（m/s）。 */
export declare const MAX_VX = 3.2;
/** 大腿力矩（rad/s^2）。 */
export declare const TQ_THIGH = 16;
/** 大腿弹簧刚度（相对躯干，拉回自然摆位）。 */
export declare const K_THIGH = 20;
/** 大腿自然摆位（相对躯干，略前）。 */
export declare const REST_THIGH = 0.05;
/** 大腿阻尼。 */
export declare const C_THIGH = 3;
/** 小腿力矩（rad/s^2，按 O/P = 蹬伸膝关节：把脚向后/向下蹬出）。 */
export declare const TQ_CALF = 14;
/** 小腿弹簧刚度（相对大腿）。 */
export declare const K_CALF = 18;
/** 小腿自然弯度（相对大腿，膝微屈）。 */
export declare const REST_CALF = 0.22;
/** 小腿阻尼。 */
export declare const C_CALF = 2.4;
/** 膝关节弯度上限（防反关节）。 */
export declare const CALF_MAX = 1.5;
/** 髋关节摆幅上限。 */
export declare const THIGH_MAX = 1.35;
/** 躯干超角阈值（rad，超过即摔倒）。1.33 ≈ 76°：前倾到肉眼明显
 * 支不住才判摔——57° 时人物看起来还站着就结算，观感是"没摔就结束"。 */
export declare const FALL_TORSO = 1.33;
/** 膝盖离地危险高度（米，低于即摔倒）。 */
export declare const KNEE_GROUND = 0.07;
/** 头部危险高度（米）。 */
export declare const HEAD_GROUND = 0.3;
/** 摔倒后瘫地沉降动画时长（ms），期间物理继续、输入无效。 */
export declare const FALL_SETTLE_MS = 1000;
/** 帧输入：Q/W = 左/右大腿，O/P = 左/右小腿。 */
export interface QwopInput {
    q: boolean;
    w: boolean;
    o: boolean;
    p: boolean;
}
/** 阶段：奔跑中 / 已摔倒 / 已过线。 */
export type QwopPhase = 'playing' | 'fallen' | 'finished';
/** 摔倒原因：躯干超角 / 膝盖触地 / 头触地。 */
export type QwopFallReason = 'torso' | 'knee' | 'head';
/** 单步内产生、供渲染层消费的可视事件。 */
export type QwopEvent = {
    type: 'step';
    x: number;
    footY: number;
    side: 'left' | 'right';
} | {
    type: 'fall';
    x: number;
    reason: QwopFallReason;
} | {
    type: 'finish';
    x: number;
};
/** 一局游戏的完整可测状态。 */
export interface QwopState {
    /** 回合内已流逝 ms。 */
    t: number;
    /** 子步时间累加器（ms），保证任意帧长下子步序列一致。 */
    acc: number;
    phase: QwopPhase;
    fallReason: QwopFallReason | null;
    /** 摔倒后已沉降 ms。 */
    settle: number;
    /** 躯干角（rad，0 = 直立，正 = 前倾）。 */
    torso: number;
    torsoW: number;
    /** 左/右大腿相对躯干角（0 = 顺躯干垂下，正 = 前摆）。 */
    thighL: number;
    thighLW: number;
    thighR: number;
    thighRW: number;
    /** 左/右小腿相对大腿角（正 = 屈膝/脚后收）。 */
    calfL: number;
    calfLW: number;
    calfR: number;
    calfRW: number;
    /** 髋位置（米）与速度。 */
    hipX: number;
    hipY: number;
    vx: number;
    vy: number;
    /** 最远前进距离（米，只增不减）。 */
    dist: number;
    /** 上一子步是否触地（渲染高亮用）。 */
    groundedL: boolean;
    groundedR: boolean;
    /** 左/右脚的落地点（钉桩 x，米；腾空时无意义）。 */
    pinLX: number;
    pinRX: number;
    events: QwopEvent[];
}
/** 各关节世界坐标（米，y 向上、地面 0）。 */
export interface QwopJoints {
    hipX: number;
    hipY: number;
    headX: number;
    headY: number;
    kneeLX: number;
    kneeLY: number;
    footLX: number;
    footLY: number;
    kneeRX: number;
    kneeRY: number;
    footRX: number;
    footRY: number;
}
/**
 * 由状态解算各关节世界坐标：角 a 的腿段方向为 (sin a, -cos a)，
 * a=0 竖直向下、正向前方。
 * @param s - 当前状态。
 * @returns 关节坐标（新对象）。
 */
export declare function qwopJoints(s: QwopState): QwopJoints;
/**
 * 新开一局：微屈膝、带前倾站在起点——这就是 QWOP 的"不控必摔"。
 * @returns 初始状态。
 */
export declare function createQwop(): QwopState;
/**
 * 推进一帧：把 dtMs 与累加器合并后按固定 SUB_MS 子步模拟，余量留到
 * 下一帧——同一累计时间下子步序列与帧切分方式无关（确定性核心）。
 * 摔倒后继续无输入沉降 FALL_SETTLE_MS 形成瘫地姿态，随后冻结。
 * @param s - 目标状态（原地修改）。
 * @param dtMs - 帧间隔 ms。
 * @param input - 当前帧输入。
 */
export declare function stepQwop(s: QwopState, dtMs: number, input: QwopInput): void;
/**
 * 当前距离分（米，向下取整）。
 * @param s - 当前状态。
 * @returns 距离分。
 */
export declare function distanceScore(s: QwopState): number;
