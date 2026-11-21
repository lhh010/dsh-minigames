/**
 * 潜行渗透（Stealth）纯逻辑：seed 确定性房间生成（边框 + 内部墙块 + 起点 +
 * 保险柜 + 钻石 + 守卫往返/环形巡逻路线，附连通性与出生点安全校验）、守卫
 * 按节拍步进巡逻、90° 视野锥判定（扇形张角 + 格点射线遮挡 raycast）、
 * 第 4 关起守卫听觉（连续快速移动累积警觉，警觉满临时扩锥）、被抓回起点
 * （守卫同步复位）、到达保险柜过关。全部随机走注入 seed（mulberry32），
 * 同 seed 重放完全一致；无 DOM。
 */
/** mulberry32：小型确定性 32 位 PRNG。
 * @param seed 种子（任意整数，内部取无符号 32 位）
 * @returns 返回 [0,1) 均匀随机数的函数
 */
export declare function mulberry32(seed: number): () => number;
/** 格坐标。 */
export interface Cell {
    x: number;
    y: number;
}
/** 玩家四向输入名。 */
export type Dir = 'up' | 'right' | 'down' | 'left';
/** 守卫朝向单位向量（四轴向之一）。 */
export interface Facing {
    dx: number;
    dy: number;
}
/** 一条守卫巡逻路线：有序格子序列 + 往返（patrol）或环形（loop）走法。 */
export interface GuardRoute {
    cells: Cell[];
    loop: boolean;
    /** 每多少节拍走一步（1 = 每拍都走）。 */
    cadence: number;
    /** 相位偏移（0..cadence-1），让守卫错峰起步。 */
    phase: number;
    startIndex: number;
    startSign: 1 | -1;
}
/** 守卫运行时状态。 */
export interface GuardState {
    x: number;
    y: number;
    facing: Facing;
    cells: Cell[];
    loop: boolean;
    index: number;
    sign: 1 | -1;
    cadence: number;
    phase: number;
    startIndex: number;
    startSign: 1 | -1;
    /** 视野距离（格）。 */
    range: number;
    /** 警觉值 0..ALERT_MAX。 */
    alert: number;
    /** 最近一次警觉增益的节拍号。 */
    lastAlertBeat: number;
    /** 警觉满后扩锥生效至该节拍号（不含）。 */
    alertedUntilBeat: number;
}
/** 钻石（taken 表示本关已收集）。 */
export interface Diamond {
    x: number;
    y: number;
    taken: boolean;
}
/** 生成出的静态盘面。 */
export interface RoomLayout {
    cols: number;
    rows: number;
    /** 1 = 墙，0 = 地板；行优先 y*cols+x。 */
    walls: Uint8Array;
    start: Cell;
    safe: Cell;
    diamonds: Cell[];
    routes: GuardRoute[];
}
/** 游戏状态（纯数据，可直接被渲染与测试读取）。 */
export interface StealthState {
    level: number;
    cols: number;
    rows: number;
    walls: Uint8Array;
    start: Cell;
    safe: Cell;
    diamonds: Diamond[];
    guards: GuardState[];
    player: Cell;
    lives: number;
    score: number;
    status: 'playing' | 'cleared' | 'gameover';
    /** 总节拍数。 */
    beats: number;
    /** 节拍累积毫秒。 */
    beatMs: number;
    /** 被抓红闪剩余毫秒（>0 时玩家被击晕不可移动）。 */
    caughtFlashMs: number;
    /** 连续快速移动计数（听觉判定用）。 */
    moveStreak: number;
    /** 上一次移动时的节拍号。 */
    lastMoveBeat: number;
}
/** 总关数。 */
export declare const LEVEL_COUNT = 5;
/** 警觉满阈值。 */
export declare const ALERT_MAX = 3;
/** 听觉半径（切比雪夫距离，格）。 */
export declare const HEARING_RADIUS = 2;
/** 基础半锥角（度）。 */
export declare const BASE_HALF_DEG = 45;
/** 警觉满后半锥角（度）。 */
export declare const ALERT_HALF_DEG = 60;
/** 警觉满后视野距离加成（格）。 */
export declare const ALERT_RANGE_BONUS = 2;
/** 警觉满后扩锥持续的节拍数。 */
export declare const ALERT_BEATS = 12;
/** 无增益连续节拍数后警觉衰减 1。 */
export declare const ALERT_DECAY_BEATS = 3;
/** 被抓红闪时长（毫秒）。 */
export declare const CAUGHT_FLASH_MS = 900;
/** 每颗钻石得分。 */
export declare const DIAMOND_SCORE = 30;
/** 过关基础分。 */
export declare const CLEAR_BASE = 100;
/** 过关时每条剩余生命加分。 */
export declare const CLEAR_LIFE_BONUS = 20;
/** 初始生命。 */
export declare const START_LIVES = 3;
/** 每关配置（守卫数 / 盘面尺寸 / 节拍间隔 / 视野 / 钻石数 / 听觉）。 */
export interface LevelConfig {
    guards: number;
    cols: number;
    rows: number;
    beatMs: number;
    range: number;
    diamonds: number;
    hearing: boolean;
}
/** 取第 level 关（1 起，越界钳制到 1..LEVEL_COUNT）的配置。
 * @param level 关卡号（1 起）
 * @returns 该关配置
 */
export declare function levelConfig(level: number): LevelConfig;
/** 该格是否为墙（越界按墙处理）。
 * @param s 读取 walls/cols/rows 的对象
 * @param x 列
 * @param y 行
 */
export declare function isWall(s: {
    walls: Uint8Array;
    cols: number;
    rows: number;
}, x: number, y: number): boolean;
/** 格点射线遮挡：from 到 to 的连线（两端点除外）穿过任一墙格即被挡。
 * @param s 含 walls/cols/rows 的状态
 * @param from 起点格
 * @param to 终点格
 * @returns true 表示视线通畅
 */
export declare function hasLineOfSight(s: {
    walls: Uint8Array;
    cols: number;
    rows: number;
}, from: Cell, to: Cell): boolean;
/** 守卫当前有效视野距离（警觉满时 +ALERT_RANGE_BONUS）。
 * @param state 用于读取 beats 的状态
 * @param guard 目标守卫
 */
export declare function effectiveRange(state: StealthState, guard: GuardState): number;
/** 守卫当前有效半锥角（弧度；警觉满时更宽）。
 * @param state 用于读取 beats 的状态
 * @param guard 目标守卫
 */
export declare function effectiveHalfRad(state: StealthState, guard: GuardState): number;
/** 判定守卫能否看见 target 格：距离 + 扇形张角 + 墙遮挡。
 * @param state 完整状态（提供 beats 与墙）
 * @param guard 目标守卫
 * @param target 被观测格
 */
export declare function guardSees(state: StealthState, guard: GuardState, target: Cell): boolean;
/** 任一守卫是否看见玩家。
 * @param state 完整状态
 */
export declare function spotPlayer(state: StealthState): boolean;
/** 生成第 level 关盘面：换种子重试至多 60 次，仍失败用兜底布局。
 * @param seed 确定性种子
 * @param level 关卡号（1 起）
 * @returns 满足连通 / 出生安全约束的盘面
 */
export declare function generateRoom(seed: number, level: number): RoomLayout;
/** 创建一关的初始状态。
 * @param seed 确定性种子（同 seed 同盘面）
 * @param level 关卡号（1 起）
 * @param lives 初始生命（默认 START_LIVES）
 * @param score 携带分数（跨关累计）
 */
export declare function createStealthState(seed: number, level: number, lives?: number, score?: number): StealthState;
/** 守卫沿路线走一步（往返到端点折返 / 环形循环），并更新朝向。
 * @param guard 目标守卫
 */
export declare function stepGuard(guard: GuardState): void;
/** 被抓处理：扣 1 命、玩家与全部守卫回初始位、红闪；命尽进入 gameover。
 * @param state 完整状态
 * @returns true 表示本次调用触发了被抓
 */
export declare function catchPlayer(state: StealthState): boolean;
/** 推进一个守卫节拍：到拍守卫走一步、警觉衰减、然后做视野判定。
 * @param state 完整状态
 * @returns true 表示本拍玩家被抓
 */
export declare function doBeat(state: StealthState): boolean;
/** 玩家朝 dir 走一格（若为地板）：吃钻石、听觉警觉累积、终点/被抓判定。
 * @param state 完整状态
 * @param dir 四向输入
 * @returns moved 是否移动；diamond 是否吃到钻石；cleared 是否过关；caught 是否被抓
 */
export declare function movePlayer(state: StealthState, dir: Dir): {
    moved: boolean;
    diamond: boolean;
    cleared: boolean;
    caught: boolean;
};
/** 帧推进：衰减红闪、按关卡节拍间隔累积触发守卫节拍。
 * @param state 完整状态
 * @param dtMs 距上一帧毫秒
 */
export declare function tickStealth(state: StealthState, dtMs: number): void;
