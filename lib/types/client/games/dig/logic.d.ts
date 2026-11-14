/**
 * 地底挖矿（Dig Dug 式）纯逻辑：种子生成的泥土网格（泥土 / 硬石 / 宝石 /
 * 落石），玩家四向移动、走进泥土格即挖开；落石在下方被掏空后先抖动 0.5 秒
 * 预警再坠落，压死玩家（损命）或压死敌人（得分）；敌人在地道中游荡并偏向
 * 追击玩家（岔路选择由种子决定）；收齐全部宝石后抵达底部出口即过关，
 * 共 5 关递进（层深 / 敌速 / 硬石密度）。全部随机走注入 seed 的 mulberry32，
 * 帧内固定 1/60 子步推进，确定性可测、可重放。
 */
/** 单元边长（逻辑像素）。 */
export declare const CELL = 24;
/** 网格列数。 */
export declare const COLS = 15;
/** 网格行数（第 0 行为地表，末行为基岩+出口）。 */
export declare const ROWS = 14;
/** 玩家移动速度（像素/秒）。 */
export declare const PLAYER_SPEED = 85;
/** 落石抖动预警时长（秒）。 */
export declare const BOULDER_SHAKE = 0.5;
/** 落石坠落速度（像素/秒）。 */
export declare const BOULDER_SPEED = 260;
/** 固定物理子步长（秒）。 */
export declare const SUB_DT: number;
/** 敌人出生后的静止倒计时（秒），给玩家逃离窗口。 */
export declare const ENEMY_DELAY = 1.2;
/** 初始生命数。 */
export declare const START_LIVES = 3;
/** 单份宝石得分。 */
export declare const GEM_SCORE = 50;
/** 压死敌人得分。 */
export declare const CRUSH_SCORE = 150;
/** 过关奖励得分。 */
export declare const LEVEL_SCORE = 500;
/** 5 关递进参数：硬石概率、宝石概率、落石数、敌人数、敌速。 */
export declare const LEVELS: ReadonlyArray<Readonly<{
    hardP: number;
    gemP: number;
    boulders: number;
    enemies: number;
    enemySpeed: number;
}>>;
/** 格子内容：空地道 / 可挖泥土 / 含宝石泥土 / 不可挖硬石 / 底部出口。 */
export type Cell = 'empty' | 'dirt' | 'hard' | 'gem' | 'exit';
export type Dir = 0 | 1 | 2 | 3;
/** 落石状态机：支撑 → 抖动（预警）→ 坠落 → 落地/压判定。 */
export type BoulderState = 'rest' | 'shake' | 'fall';
export interface Boulder {
    /** 所在列。 */
    c: number;
    /** 顶部 y（逻辑像素）；rest 时恒为整行对齐。 */
    y: number;
    state: BoulderState;
    /** 抖动剩余秒数。 */
    timer: number;
}
export interface Enemy {
    x: number;
    y: number;
    dir: Dir;
    homeX: number;
    homeY: number;
}
export interface DigState {
    level: number;
    grid: Cell[][];
    /** 出口所在列（末行）。 */
    exitCol: number;
    player: {
        x: number;
        y: number;
        dir: Dir;
        intent: Dir;
    };
    enemies: Enemy[];
    boulders: Boulder[];
    gemsLeft: number;
    gemsTotal: number;
    score: number;
    lives: number;
    over: boolean;
    won: boolean;
    /** 敌人出生静止剩余秒数。 */
    enemyDelay: number;
    /** 固定子步累积器（秒）。 */
    acc: number;
    rng: () => number;
}
/**
 * mulberry32 确定性随机数生成器：全部游戏随机（地形、岔路）都走它，
 * 同一 seed 序列完全一致，保证可测可重放。
 * @param seed - 32 位非负整数种子。
 * @returns 返回 [0, 1) 随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/** (r, c) 是否在网格内。 */
export declare function inBounds(r: number, c: number): boolean;
/**
 * 创建一次全新冒险：第 1 关、3 条命，地形由 seed 决定。
 * @param seed - 32 位种子，相同种子得到完全相同的关卡序列。
 * @returns 初始 DigState。
 */
export declare function createDigState(seed: number): DigState;
/**
 * 推进游戏：dt 先累积，再按固定 1/60 子步整数次推进（余量留到下一帧），
 * 与帧率无关、确定性可重放。
 * @param state - 游戏状态（就地修改）。
 * @param dt - 帧间隔秒数。
 * @returns 是否处于终局（over 或 won）。
 */
export declare function stepDig(state: DigState, dt: number): boolean;
