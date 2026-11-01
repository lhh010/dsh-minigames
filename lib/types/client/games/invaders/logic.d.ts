/**
 * 小蜜蜂（Space Invaders）纯逻辑：玩家炮台在底部左右移动并开火（冷却），
 * 外星人按 9x4 网格编队左右横移、触边整体下移，剩余越少移动越快；
 * 编队随机从各列最低处的外星人开火。4 个掩体由方块网格组成，被任意一方
 * 子弹打中即蚀去周围方块。3 条命，被击中短暂无敌并清空敌方子弹；整波
 * 消灭进入下一波（起始高度更低、开火更频繁），外星人推进到炮台线或
 * 生命耗尽即结束。随机数全部走 mulberry32(seed, round)，同 seed 同输入
 * 轨迹完全一致。时间单位毫秒，物理单位 px / s。
 */
/** 逻辑画布尺寸。 */
export declare const W = 480;
export declare const H = 600;
/** 编队规格。 */
export declare const COLS = 9;
export declare const ROWS = 4;
export declare const CELL = 34;
export declare const ALIEN_W = 24;
export declare const ALIEN_H = 18;
/** 编队初始左上角 x（水平居中）。 */
export declare const FORMATION_X0: number;
/** 第 1 波编队顶部 y。 */
export declare const START_Y = 70;
/** 触边一次下移的像素。 */
export declare const DROP = 14;
/** 编队基础 / 峰值横移速度 px/s（剩余越少越接近峰值）。 */
export declare const BASE_SPEED = 18;
export declare const MAX_SPEED = 130;
/** 炮台参数。 */
export declare const PLAYER_W = 30;
export declare const PLAYER_H = 14;
export declare const PLAYER_Y: number;
export declare const PLAYER_SPEED = 230;
/** 开火冷却 ms。 */
export declare const FIRE_CD = 450;
/** 玩家子弹速度 px/s（向上为负）。 */
export declare const PLAYER_BULLET_V = 420;
/** 同屏玩家子弹上限。 */
export declare const PLAYER_BULLET_MAX = 2;
/** 掩体参数：7x4 个 6px 方块。 */
export declare const BUNKER_COUNT = 4;
export declare const BUNKER_CELL = 6;
export declare const BUNKER_COLS = 7;
export declare const BUNKER_ROWS = 4;
export declare const BUNKER_W: number;
export declare const BUNKER_Y: number;
/** 第 i 个掩体的左上角 x。 */
export declare function bunkerX(i: number): number;
/** 初始生命。 */
export declare const START_LIVES = 3;
/** 被击中后的无敌时长 ms。 */
export declare const INVULN_MS = 1500;
/** 波次横幅展示时长 ms。 */
export declare const BANNER_MS = 1200;
/** 清波奖励分。 */
export declare const WAVE_BONUS = 100;
/**
 * mulberry32 确定性随机数发生器（与其它游戏互不依赖的同名实现）。
 * @param seed - 非负整数种子。
 * @returns 返回 [0,1) 均匀随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/** 一个存活状态的外星人（位置由编队原点 + 行列推算）。 */
export interface Alien {
    col: number;
    row: number;
    alive: boolean;
}
/** 一颗在飞的子弹；vy 向上为负。 */
export interface Bullet {
    x: number;
    y: number;
    vy: number;
}
/** 一格掩体方块。 */
export interface BunkerCell {
    alive: boolean;
}
/** 一个掩体（方块网格）。 */
export interface Bunker {
    x: number;
    cells: BunkerCell[];
}
/** 单步内产生、供渲染层消费的可视事件。 */
export type InvadersEvent = {
    type: 'kill';
    x: number;
    y: number;
    row: number;
} | {
    type: 'hit';
    x: number;
    y: number;
} | {
    type: 'wave';
    wave: number;
} | {
    type: 'bunker';
    x: number;
    y: number;
};
/** 玩家一帧的输入（按住即 true，开火由冷却节流）。 */
export interface InvadersInput {
    left: boolean;
    right: boolean;
    fire: boolean;
}
/** 一局游戏的完整可测状态。 */
export interface InvadersState {
    /** 局内已流逝 ms。 */
    t: number;
    score: number;
    lives: number;
    wave: number;
    over: boolean;
    /** 炮台中心 x。 */
    playerX: number;
    /** 开火冷却剩余 ms。 */
    fireCd: number;
    /** 无敌剩余 ms。 */
    invulnMs: number;
    /** 波次横幅剩余 ms。 */
    bannerMs: number;
    /** 编队原点。 */
    fx: number;
    fy: number;
    /** 编队横移方向 1 / -1。 */
    dir: 1 | -1;
    aliens: Alien[];
    playerBullets: Bullet[];
    alienBullets: Bullet[];
    /** 敌方下次开火倒计时 ms。 */
    alienFireCd: number;
    bunkers: Bunker[];
    events: InvadersEvent[];
    rng: () => number;
}
/**
 * 行号 → 外星人类型：0 行（顶）= 2 号造型 30 分，中间行 = 1 号 20 分，底行 = 0 号 10 分。
 * @param row - 编队行号（0 顶部）。
 * @returns 造型编号 0/1/2。
 */
export declare function rowType(row: number): number;
/**
 * 行号对应分值。
 * @param row - 编队行号。
 * @returns 击落该行外星人的得分。
 */
export declare function rowScore(row: number): number;
/**
 * 新开一局（第 1 波编队就位）。
 * @param seed - 外部种子（如日期）。
 * @param round - 第几局（同 seed 不同局轨迹不同）。
 * @returns 初始状态。
 */
export declare function createInvaders(seed: number, round?: number): InvadersState;
/**
 * 推进一帧：炮台移动与开火、编队横移 / 触边下移、敌方开火、子弹飞行与
 * 全部碰撞（外星人 / 炮台 / 掩体 / 双方子弹互消）、波次清空与结束判定。
 * 事件写入 state.events，调用方每帧消费后由本函数在下一帧开头清空。
 * @param state - 目标状态。
 * @param dtMs - 帧间隔 ms。
 * @param input - 本帧玩家输入。
 */
export declare function stepInvaders(state: InvadersState, dtMs: number, input: InvadersInput): void;
