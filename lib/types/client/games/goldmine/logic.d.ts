/**
 * 淘金者（Boulder Dash 式简化）纯逻辑：seed 生成的矿洞网格（可挖泥土 /
 * 不可挖硬岩 / 金块 / 宝石 / 空腔 / 底部出口），玩家四向逐格移动、走进泥土
 * 即挖开；重力对金块与圆石生效（下方被掏空即逐格下落，圆石下落砸中玩家
 * 损命）；圆石可被水平侧推一格触发连锁——坠落超过一格再砸到硬岩会把硬岩
 * 砸开继续下沉。收齐全部金块后出口开启，抵达出口过关；3 命、每关限时，
 * 5 关递进（矿洞更大、圆石更多）。地形生成后做 BFS 可解性验证（硬岩不
 * 隔断金块与出口），全部随机走注入 seed 的 mulberry32，逻辑本身无随机，
 * 确定性可测、可重放。
 */
/** 单元边长（逻辑像素）。 */
export declare const CELL = 26;
/** HUD 高度（逻辑像素）。 */
export declare const HUD_H = 30;
/** 最大关卡网格（渲染画布按第 5 关尺寸固定，小关居中）。 */
export declare const MAX_COLS = 21;
export declare const MAX_ROWS = 15;
/** 逻辑画布宽。 */
export declare const LOGICAL_W: number;
/** 逻辑画布高。 */
export declare const LOGICAL_H: number;
/** 初始生命数。 */
export declare const START_LIVES = 3;
/** 单块金块得分。 */
export declare const GOLD_SCORE = 100;
/** 单颗宝石得分。 */
export declare const GEM_SCORE = 150;
/** 过关基础奖励。 */
export declare const LEVEL_SCORE = 300;
/** 过关剩余每秒额外奖励。 */
export declare const TIME_BONUS_PER_S = 2;
/** 单格下落动画时长（秒）。 */
export declare const FALL_ANIM_S = 0.08;
/** 圆石砸开硬岩所需的最少下落格数。 */
export declare const SMASH_FALL = 2;
/** 5 关递进参数：网格列 / 行、限时秒、金块 / 宝石 / 圆石数、硬岩与空腔密度。 */
export declare const LEVELS: ReadonlyArray<Readonly<{
    cols: number;
    rows: number;
    time: number;
    golds: number;
    gems: number;
    boulders: number;
    hardP: number;
    caveP: number;
}>>;
/** 格子内容：空腔 / 可挖泥土 / 金块 / 宝石 / 不可挖硬岩 / 底部出口。 */
export type Cell = 'empty' | 'dirt' | 'hard' | 'gold' | 'gem' | 'exit';
export type Dir = 0 | 1 | 2 | 3;
/** 圆石：独立实体（可推、可坠、可砸硬岩）。 */
export interface Boulder {
    r: number;
    c: number;
    /** 本轮连续下落格数（砸硬岩判定用）。 */
    dist: number;
}
/** 下落动画条目：某列一实体从 fromR 落到 toR 的插值信息。 */
export interface FallAnim {
    kind: 'boulder' | 'gold';
    c: number;
    fromR: number;
    toR: number;
    t: number;
}
export interface GoldmineState {
    level: number;
    cols: number;
    rows: number;
    grid: Cell[][];
    exitC: number;
    spawnC: number;
    player: {
        r: number;
        c: number;
        dir: Dir;
    };
    boulders: Boulder[];
    goldsLeft: number;
    goldsTotal: number;
    gemsTotal: number;
    score: number;
    lives: number;
    timeLeft: number;
    over: boolean;
    won: boolean;
    /** 进行中的下落动画。 */
    anims: FallAnim[];
    rng: () => number;
}
/**
 * mulberry32 确定性随机数生成器：地形生成的全部随机都走它，同 seed 序列
 * 完全一致，保证可测可重放。
 * @param seed - 32 位非负整数种子。
 * @returns 返回 [0, 1) 随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/** (r, c) 是否在当前关网格内。 */
export declare function inBounds(state: GoldmineState, r: number, c: number): boolean;
/** (r, c) 处是否有圆石。 */
export declare function boulderAt(state: GoldmineState, r: number, c: number): boolean;
/** 出口开启判定：金块收齐即开。 */
export declare function exitOpen(state: GoldmineState): boolean;
/**
 * 玩家行动（一次一格）：水平走进圆石且其身后为空则侧推；走进泥土即挖开，
 * 金块 / 宝石拾取计分；随后重力沉降（圆石连锁 / 砸中判定）；踏上已开启的
 * 出口即过关。任何行动（含被挡）都会触发沉降，推动后的连锁得以结算。
 * @param state - 游戏状态（就地修改）。
 * @param dir - 方向。
 * @returns 是否发生状态变化（供渲染置脏）。
 */
export declare function moveGoldmine(state: GoldmineState, dir: Dir): boolean;
/**
 * 实时推进：倒计时与下落动画。倒计时归零损命并重置本关计时。
 * @param state - 游戏状态（就地修改）。
 * @param dt - 帧间隔秒数。
 * @returns 是否处于终局（over 或 won）。
 */
export declare function stepGoldmine(state: GoldmineState, dt: number): boolean;
/**
 * 直接构造指定关卡状态（测试 / 调试用；内部走同一生成路径）。
 * @param seed - 32 位种子。
 * @param level - 关卡号（1..LEVELS.length）。
 * @returns 该关初始 GoldmineState。
 */
export declare function createGoldmineStateAtLevel(seed: number, level: number): GoldmineState;
/**
 * 创建一次全新冒险：第 1 关、3 条命，地形由 seed 决定。
 * @param seed - 32 位种子，相同种子得到完全相同的关卡序列。
 * @returns 初始 GoldmineState。
 */
export declare function createGoldmineState(seed: number): GoldmineState;
