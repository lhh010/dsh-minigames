/**
 * 弹球台 Pinball2 纯逻辑：双球物理弹台状态机。与单球版 pinball 的区别：
 * 同时最多两颗球在场（先后发射、球与球可互撞）、3 张递进台面（bumbers
 * 更多 / 底部漏斗更宽 / 第 3 台加入磁力洞吸球偏转）、连击计分倍率、
 * 每球 3 次 nudge 超限即 TILT 没收在场的球。
 *
 * 物理为圆球-线段碰撞（反弹系数 0.65）、重力 1200、固定 240Hz 子步
 * （确定性模拟，无速度自适应分支），挡板为胶囊体，接触点表面速度的
 * 一半传给球。所有随机（台面布置抖动、nudge 抖动、卡球救援方向）都
 * 走注入 seed 的 mulberry32，同一 seed + 同一输入脚本必然重放出同一
 * 轨迹（见 hashRun）。render.ts 只画状态；index.ts 只管输入接线。
 */
/** 逻辑画布尺寸。 */
export declare const TABLE_W = 440;
export declare const TABLE_H = 700;
/** 球半径。 */
export declare const BALL_R = 9;
/** 向下重力（px/s²）。 */
export declare const GRAVITY = 1200;
/** 固定子步时长（1/240 s）。 */
export declare const SUBSTEP_DT: number;
/** 速度上限（防穿透：每子步位移 ≤ 7.5px < 球半径）。 */
export declare const MAX_SPEED = 1800;
/** 墙 / 斜面反弹系数。 */
export declare const WALL_E = 0.65;
/** 低于该法向接近速度时贴合表面不再反弹（防微抖）。 */
export declare const REST_SPEED = 40;
/** 全局线性阻尼（每秒指数衰减系数）。 */
export declare const DAMPING_K = 0.1;
/** 挡板：胶囊半径、摆动角速度、回摆角速度。 */
export declare const FLIPPER_R = 8.5;
export declare const FLIPPER_OMEGA = 20;
export declare const FLIPPER_RETURN = 13;
/** 挡板反弹系数与表面速度传递比例（规格要求：挡板运动速度传给球一半）。 */
export declare const FLIPPER_E = 0.4;
export declare const FLIPPER_SURFACE_FACTOR = 0.5;
/** 发射器：充满时间与最小 / 最大弹出速度。 */
export declare const PLUNGER_CHARGE_S = 1.2;
export declare const PLUNGER_MIN_SPEED = 620;
export declare const PLUNGER_MAX_SPEED = 1500;
/** 全局可用球数与同场球数上限（双球玩法）。 */
export declare const BALLS_TOTAL = 5;
export declare const MAX_BALLS_IN_PLAY = 2;
/** nudge 次数上限（按球计）；下一次即 TILT，没收当前在场的球。 */
export declare const NUDGE_LIMIT = 3;
/** 球心低于此 y 判落沟。 */
export declare const DRAIN_Y: number;
/** 卡球救援：静置多久后推一把、最多推几次、推力大小。 */
export declare const STUCK_RESCUE_S = 1.6;
export declare const STUCK_KICK_MAX = 3;
export declare const RESCUE_KICK = 320;
/** 得分：bumper / slingshot / drop target / 整排清空 / 磁力洞。 */
export declare const BUMPER_POINTS = 150;
export declare const SLING_POINTS = 75;
export declare const TARGET_POINTS = 60;
export declare const BANK_BONUS = 800;
export declare const MAGNET_POINTS = 300;
/** 触发冷却（s）：bumper / slingshot / 磁力洞。 */
export declare const BUMPER_COOLDOWN = 0.12;
export declare const SLING_COOLDOWN = 0.2;
export declare const MAGNET_COOLDOWN = 1.2;
/** 连击：计分命中后 3 秒内再命中计入连击；每 5 连击 +1 倍率，封顶 5。 */
export declare const COMBO_WINDOW = 3;
export declare function comboMultiplier(hits: number): number;
/** 磁力洞：吸引半径与基准吸力（第 3 台才有）。 */
export declare const MAGNET_RADIUS = 120;
export declare const MAGNET_PULL = 1350;
/** 升到第 t+1 台所需累计分。 */
export declare function levelThreshold(table: number): number;
export type Pinball2Result = 'playing' | 'paused' | 'gameOver';
export interface Ball {
    x: number;
    y: number;
    vx: number;
    vy: number;
    /** 渲染拖尾用的最近位置（每帧记录，最多 TRAIL_MAX 个）。 */
    trail: {
        x: number;
        y: number;
    }[];
    /** 卡球检测：静置秒数与已救援次数。 */
    stuckT: number;
    stuckKicks: number;
}
export interface Bumper {
    x: number;
    y: number;
    r: number;
    cd: number;
}
export interface Sling {
    ax: number;
    ay: number;
    bx: number;
    by: number;
    cd: number;
}
export interface DropTarget {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    down: boolean;
}
export interface Wall {
    ax: number;
    ay: number;
    bx: number;
    by: number;
}
export type FlipperSide = 'left' | 'right';
export interface Flipper {
    side: FlipperSide;
    px: number;
    py: number;
    len: number;
    /** 当前 / 静置 / 抬起角度（弧度，屏幕坐标 +y 向下）。 */
    angle: number;
    rest: number;
    active: number;
    held: boolean;
    /** 当前角速度（rad/s），驱动接触点表面速度。 */
    omega: number;
}
export interface Magnet {
    x: number;
    y: number;
    cd: number;
}
export type Pinball2Event = {
    kind: 'bumper';
    x: number;
    y: number;
} | {
    kind: 'sling';
    x: number;
    y: number;
} | {
    kind: 'target';
    x: number;
    y: number;
} | {
    kind: 'bank';
    x: number;
    y: number;
} | {
    kind: 'magnet';
    x: number;
    y: number;
} | {
    kind: 'hit';
    x: number;
    y: number;
} | {
    kind: 'tableUp';
    table: number;
} | {
    kind: 'drain';
} | {
    kind: 'launch';
    speed: number;
} | {
    kind: 'tilt';
};
export interface Pinball2State {
    result: Pinball2Result;
    pausedFrom: Pinball2Result | null;
    /** 当前台面 1..3。 */
    table: number;
    score: number;
    /** 尚未损失的球数（含在场与待发射）。 */
    ballsLeft: number;
    /** 在场的球（最多 2）。 */
    balls: Ball[];
    flippers: {
        left: Flipper;
        right: Flipper;
    };
    bumpers: Bumper[];
    slings: Sling[];
    targets: DropTarget[];
    walls: Wall[];
    /** 第 3 台的磁力洞；低台面为 null。 */
    magnet: Magnet | null;
    /** 发射器充能 0..1。 */
    plunger: number;
    plungerHeld: boolean;
    /** 当前这颗球周期内已用 nudge 次数。 */
    nudgesUsed: number;
    /** 连击命中数与剩余窗口（s）。 */
    combo: number;
    comboTimer: number;
    time: number;
    msg: string;
    msgTimer: number;
    events: Pinball2Event[];
    rng: () => number;
}
/** mulberry32 种子随机（与其它游戏一致的实现）。 */
export declare function mulberry32(seed: number): () => number;
/** 拖尾最大记录点数。 */
export declare const TRAIL_MAX = 10;
export declare const LEFT_PIVOT: {
    x: number;
    y: number;
};
export declare const RIGHT_PIVOT: {
    x: number;
    y: number;
};
export declare const FLIPPER_LEN = 62;
/** 生成一侧挡板：静置下垂、抬起过水平。 */
export declare function makeFlipper(side: FlipperSide): Flipper;
/** 挡板在当前角度下的尖端坐标。 */
export declare function flipperTip(f: Flipper): {
    x: number;
    y: number;
};
/**
 * 种子化台面布置：同一 (table, seed) 恒得到同一布置。bumper 数随台面
 * 递增（3/4/5），位置由 rng 在上带内抖动并保持最小间距；底部漏斗随
 * 台面变宽；第 3 台附加磁力洞。
 * @param table - 台面编号 1..3。
 * @param seed - 布置种子。
 */
export declare function makeTableLayout(table: number, seed: number): {
    bumpers: Bumper[];
    walls: Wall[];
    slings: Sling[];
    targets: DropTarget[];
    magnet: Magnet | null;
};
/** 发射道待发球位（道底之上一个半径）。 */
export declare const BALL_SPAWN: {
    x: number;
    y: number;
};
/** 球是否还在发射道内（未上桌）。 */
export declare function ballInLaunchZone(ball: {
    x: number;
    y: number;
}): boolean;
/** 是否还有待发射的球（发射道有球且在场未满）。 */
export declare function laneReady(state: Pinball2State): boolean;
/** 新建一局：table 台面、seed 决定布置与随机抖动。 */
export declare function createGame(table: number, seed: number): Pinball2State;
/** 重开：回到第 1 台、固定 seed 的新一局。 */
export declare function restart(state: Pinball2State): void;
/**
 * 点 p 到线段 a→b 的最近点与距离平方（纯几何）。
 * @returns 最近点坐标及 d²。
 */
export declare function closestPointOnSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): {
    x: number;
    y: number;
    d2: number;
};
/**
 * 圆-点碰撞：沿法线推出并按反弹系数反射法向速度；minKick>0 时保证至少
 * 该大小的离场法向速度（bumber/slingshot 蓄力弹射），普通表面低速贴合。
 * @param ball - 被解算的球（命中时原地修改）。
 * @param r - 碰撞等效半径。
 * @param e - 反弹系数。
 * @param minKick - 最小离场法向速度。
 * @param cx - 接触点 x。
 * @param cy - 接触点 y。
 * @returns 是否发生接触。
 */
export declare function bounceOffPoint(ball: Ball, r: number, e: number, minKick: number, cx: number, cy: number): boolean;
/**
 * 球 vs 挡板胶囊（pivot→tip 线段加 FLIPPER_R）。接触点表面速度
 * （ω ẑ × r）参与反弹：法向相对速度按反弹系数反射后，再把表面速度
 * 法向分量的一半加回给球——抬起的挡板把球甩上天。
 * @param ball - 被解算的球（命中时原地修改）。
 * @param f - 当前角度与角速度下的挡板。
 * @returns 是否发生接触。
 */
export declare function resolveFlipper(ball: Ball, f: Flipper): boolean;
/**
 * 推进整个模拟 dt 秒：固定 240Hz 子步（每帧恒定子步数，确定性模拟）。
 * 子步内依次处理重力、积分、墙、bumper、slingshot、drop target、磁力
 * 洞、挡板、球-球碰撞、阻尼与限速；帧级处理拖尾、充能、连击窗口、
 * 台面升级与卡球救援。
 * @param state - 游戏状态（原地推进）。
 * @param dt - 帧时长（秒）。
 */
export declare function step(state: Pinball2State, dt: number): void;
/** 按住 / 松开一侧挡板。 */
export declare function setFlipper(state: Pinball2State, side: FlipperSide, held: boolean): void;
/**
 * 轻推台面：所有在场球获得一个种子随机的小冲量。每颗球周期内最多
 * NUDGE_LIMIT 次，超限触发 TILT——没收全部在场球并重置计数。
 * @returns true 表示推台生效；false 表示当前无可推的球或已终局。
 */
export declare function nudge(state: Pinball2State): boolean;
/**
 * 松开发射器：把待发球以充能比例的初速弹出（充能 0 也按最小力度）。
 * 发射道无球或在场已满 2 颗时蓄力作废。
 * @returns 弹出速度；未发射返回 0。
 */
export declare function plungerRelease(state: Pinball2State): number;
/** 暂停 / 恢复切换（记住暂停前的结果以便恢复）。 */
export declare function togglePause(state: Pinball2State): void;
/** hashRun 的输入脚本条目：t 秒时刻触发动作 a。 */
export interface ScriptedInput {
    t: number;
    a: 'leftDown' | 'leftUp' | 'rightDown' | 'rightUp' | 'nudge' | 'plungerDown' | 'plungerRelease';
}
/**
 * 确定性重放辅助：从新局起按 60Hz 步进 seconds 秒，按脚本时刻注入输入，
 * 对全部球的轨迹取哈希。同 seed + 同脚本必得同哈希（测试冻结确定性）。
 */
export declare function hashRun(seed: number, script: ScriptedInput[], seconds: number): number;
