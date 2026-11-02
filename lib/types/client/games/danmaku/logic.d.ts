/**
 * 弹幕决战（Danmaku）纯逻辑：纵向卷轴弹幕射击。玩家慢速移动 + Shift 精确
 * 模式（缩小判定点）+ 短冷却双管射击，轮战 3 个 Boss（每个 3 阶段血条）。
 * 弹幕由参数化发射器引擎驱动（环形 / 扇形 / 螺旋 / 瞄准流 / 花瓣交错，
 * 每阶段组合 2-3 个发射器，参数随发射次数演化）；敌弹与玩家判定点做
 * 圆形碰撞（判定点半径 ~4px），擦弹（弹心距 < 18px 未命中）+10 分并只
 * 计一次。被弹 -1 命（3 命）+ 短无敌 + 全屏消弹；阶段切换与 Boss 击破
 * 均清屏。Boss 移动由 ai.ts 的分帧评估大脑规划（每帧限额评估候选）。
 * 随机数全部走
 * mulberry32(seed, round)，同 seed 同输入轨迹完全一致。时间单位毫秒，
 * 物理单位 px / s。
 */
export declare const W = 480;
export declare const H = 640;
/** 玩家参数。 */
export declare const PLAYER_SPEED = 210;
/** 精确模式速度倍率。 */
export declare const FOCUS_SLOW = 0.45;
/** 精确模式判定点半径 px。 */
export declare const HIT_R_FOCUS = 3.5;
/** 常规判定点半径 px。 */
export declare const HIT_R_NORMAL = 5;
/** 擦弹判定半径 px（弹心到判定点中心）。 */
export declare const GRAZE_R = 18;
/** 擦弹得分。 */
export declare const GRAZE_SCORE = 10;
/** 开火冷却 ms。 */
export declare const FIRE_CD = 130;
/** 玩家子弹速度 px/s（向上为负）。 */
export declare const PLAYER_SHOT_V = 560;
/** 双管炮横向间距。 */
export declare const SHOT_GAP = 6;
/** 生命与无敌。 */
export declare const START_LIVES = 3;
export declare const INVULN_MS = 1800;
/** Boss 布局。 */
export declare const BOSS_Y = 150;
export declare const BOSS_ENTER_MS = 1400;
/** Boss 机体受击半径 px。 */
export declare const BOSS_HIT_R = 34;
/** 阶段切换停火展示 ms。 */
export declare const BREAK_MS = 900;
/** Boss 间横幅 ms。 */
export declare const BANNER_MS = 1600;
/** 同屏敌弹上限。 */
export declare const MAX_ENEMY_BULLETS = 480;
/** 得分配置。 */
export declare const SHOT_SCORE = 5;
export declare const PHASE_BONUS = 300;
/** 第 i 个 Boss 击破奖励（1 起）。 */
export declare function bossBonus(bossIndex0: number): number;
/**
 * mulberry32 确定性随机数发生器（与其它游戏互不依赖的同名实现）。
 * @param seed - 非负整数种子。
 * @returns 返回 [0,1) 均匀随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/** 敌弹颜色（红 / 紫两色，渲染层据此发光）。 */
export type BulletColor = 'red' | 'purple';
/** 发射器几何类型。 */
export type EmitterKind = 'ring' | 'fan' | 'spiral' | 'aimed' | 'petal';
/**
 * 参数化发射器规格。角度采用画布坐标系（+x 向右、+y 向下，PI/2 即正下）。
 * 演化：speedGrow 每次齐射给 speed 递增（封顶 speedMax）；ring / petal 的
 * baseAngle 每次齐射自旋 spin 弧度；spiral 的累计角每次齐射推进 spin。
 */
export interface EmitterSpec {
    kind: EmitterKind;
    /** 齐射间隔 ms。 */
    intervalMs: number;
    /** 每次齐射弹数（spiral 为臂数，petal 为每层瓣数）。 */
    count: number;
    speed: number;
    color: BulletColor;
    /** 扇形总张角 rad（fan / aimed）。 */
    spread?: number;
    /** 每次齐射的角度推进 rad（ring / petal / spiral）。 */
    spin?: number;
    /** 每次齐射的速度增量 px/s。 */
    speedGrow?: number;
    speedMax?: number;
    /** 初始基准角 rad。 */
    baseAngle?: number;
}
/** 发射器运行时状态（随局面保存，保证重放一致）。 */
export interface EmitterRuntime {
    spec: EmitterSpec;
    /** 距下次齐射 ms。 */
    nextAt: number;
    /** 已齐射次数。 */
    clock: number;
    /** 当前演化速度 px/s。 */
    speed: number;
    /** 当前演化基准角 rad。 */
    angle: number;
}
/** 一颗敌弹；graze 标记该弹是否已被擦过（每弹只计一次）。 */
export interface EnemyBullet {
    x: number;
    y: number;
    vx: number;
    vy: number;
    /** 弹体半径 px。 */
    r: number;
    color: BulletColor;
    grazed: boolean;
}
/** 一发玩家子弹。 */
export interface PlayerShot {
    x: number;
    y: number;
}
/** 单步内产生、供渲染层消费的可视事件。 */
export type DanmakuEvent = {
    type: 'graze';
    x: number;
    y: number;
} | {
    type: 'hit';
    x: number;
    y: number;
} | {
    type: 'bossHit';
    x: number;
    y: number;
} | {
    type: 'phase';
    boss: number;
    phase: number;
} | {
    type: 'bossDown';
    boss: number;
    x: number;
    y: number;
} | {
    type: 'win';
} | {
    type: 'banner';
    boss: number;
};
/** 玩家一帧的输入（按住即 true）。 */
export interface DanmakuInput {
    left: boolean;
    right: boolean;
    up: boolean;
    down: boolean;
    fire: boolean;
    focus: boolean;
}
/**
 * 环形齐射角度：base 起均分一整圈。
 * @param count - 弹数。
 * @param base - 基准角 rad。
 * @returns count 个角度 rad。
 */
export declare function ringAngles(count: number, base: number): number[];
/**
 * 扇形齐射角度：以 center 为中心张开 spread。count 为 1 时只发中心。
 * @param count - 弹数。
 * @param center - 中心角 rad。
 * @param spread - 总张角 rad。
 * @returns count 个角度 rad。
 */
export declare function fanAngles(count: number, center: number, spread: number): number[];
/**
 * 花瓣交错齐射角度：clock 奇偶交替两层，第二层错开半步形成交错花瓣。
 * @param count - 每层瓣数。
 * @param base - 基准角 rad。
 * @param clock - 已齐射次数（决定层）。
 * @returns count 个角度 rad。
 */
export declare function petalAngles(count: number, base: number, clock: number): number[];
/** 从 (fromX,fromY) 指向 (toX,toY) 的方位角 rad。 */
export declare function angleTo(fromX: number, fromY: number, toX: number, toY: number): number;
/**
 * 玩家当前判定点半径（精确模式缩小）。
 * @param focus - 是否精确模式。
 */
export declare function hitRadius(focus: boolean): number;
/** Boss 定义：名称、三阶段血量、每阶段发射器组合、移动速度。 */
export interface BossDef {
    name: string;
    hp: [number, number, number];
    speed: number;
    phases: [EmitterSpec[], EmitterSpec[], EmitterSpec[]];
}
/** 三个 Boss：花仙 → 月蝶 → 星焰，阶段逐级加密。 */
export declare const BOSSES: BossDef[];
/** 一局游戏的完整可测状态。 */
export interface DanmakuState {
    /** 局内已流逝 ms。 */
    t: number;
    score: number;
    lives: number;
    over: boolean;
    /** 全胜通关。 */
    win: boolean;
    playerX: number;
    playerY: number;
    fireCd: number;
    invulnMs: number;
    /** 擦弹次数。 */
    graze: number;
    /** 当前 Boss 下标（0 起，2 = 星焰）。 */
    bossIndex: number;
    /** 当前阶段下标（0 起）。 */
    phase: number;
    bossHp: number;
    bossMaxHp: number;
    bossX: number;
    bossY: number;
    /** Boss 入场剩余 ms（>0 时无敌不发射）。 */
    bossEnterMs: number;
    /** 横幅剩余 ms。 */
    bannerMs: number;
    /** 阶段切换停火剩余 ms。 */
    breakMs: number;
    bossAlive: boolean;
    enemyBullets: EnemyBullet[];
    playerShots: PlayerShot[];
    emitters: EmitterRuntime[];
    events: DanmakuEvent[];
    rng: () => number;
    /** Boss 移动大脑（ai.ts），随局面保存保证重放一致。 */
    brain: BossBrainLike;
}
/** 逻辑层依赖的大脑接口（ai.ts 实现，接口隔离便于测试替身）。 */
export interface BossBrainLike {
    /** 供逻辑层每帧调用：推进大脑并给出当前移动目标。 */
    step(state: DanmakuState, dtMs: number): void;
    targetX: number;
    targetY: number;
}
/**
 * 新开一局（第 1 个 Boss 入场中）。
 * @param seed - 外部种子（如日期）。
 * @param round - 第几局（同 seed 不同局轨迹不同）。
 * @param makeBrain - 大脑工厂（默认用 ai.ts 的分帧大脑；测试可注入替身）。
 * @returns 初始状态。
 */
export declare function createDanmaku(seed: number, round?: number, makeBrain?: () => BossBrainLike): DanmakuState;
/**
 * 推进一帧：玩家移动 / 开火、Boss 入场与移动、发射器齐射、双方子弹飞行、
 * 玩家弹打 Boss、敌弹命中与擦弹、被弹处理、阶段 / Boss 流转。事件写入
 * state.events，调用方每帧消费（下一帧开头清空）。
 * @param state - 目标状态。
 * @param dtMs - 帧间隔 ms。
 * @param input - 本帧玩家输入。
 */
export declare function stepDanmaku(state: DanmakuState, dtMs: number, input: DanmakuInput): void;
