/**
 * 消防救火纯逻辑：街区网格（建筑/草地/空地）上随机起火，玩家消防员
 * 四向移动并按空格喷射锥形水柱；火沿易燃格按 seed 概率流蔓延（风向
 * 加成），建筑燃尽成黑色废墟并计入损失。全部状态可变但完全确定：同
 * 一 seed + 同一指令序列必然整局重放一致，测试直接驱动本模块。
 */
/** 确定性 32 位随机源（盘面生成 / 蔓延概率流）。 */
export declare function mulberry32(seed: number): () => number;
/** 格子地物类型：建筑（不可通行、高燃值、烧毁计损失）、草地（可通行、
 * 快速蔓延、烧尽仅烧焦）、空地（道路，不燃）。 */
export type TileKind = 'building' | 'grass' | 'empty';
export type Direction = 'up' | 'down' | 'left' | 'right';
export type FirePhase = 'play' | 'clear' | 'won';
/** 相邻格点火基础概率：草快建筑慢，空地不可燃。 */
export declare const CATCH_GRASS = 0.32;
export declare const CATCH_BUILDING = 0.18;
/** 风向加成：下风侧邻居 ×1.8，逆风侧 ×0.45。 */
export declare const WIND_ALIGNED = 1.8;
export declare const WIND_OPPOSED = 0.45;
/** 每格燃值（火强度上限）：建筑高燃值难扑灭，草低燃值速燃速尽。 */
export declare const FUEL_BUILDING = 16;
export declare const FUEL_GRASS = 8;
/** 单次喷水对准格火强度的削减量。 */
export declare const WATER_DMG = 3;
/** 水柱射程（格）。 */
export declare const SPRAY_RANGE = 4;
/** 消防员碰火受伤后的冷却秒数（回撤起点，不是死亡）。 */
export declare const INJURE_COOLDOWN = 3;
/** 火势节奏：每 FIRE_INTERVAL 秒结算一次增长+蔓延。 */
export declare const FIRE_INTERVAL = 0.85;
/** 喷水节奏：按住空格每 WATER_INTERVAL 秒结算一次命中。 */
export declare const WATER_INTERVAL = 0.28;
/** 关卡过关展示秒数，随后自动进入下一关。 */
export declare const CLEAR_TIME = 2.2;
/** 一关的盘面与火情参数。 */
export interface FireLevelConfig {
    /** 网格宽（格）。 */
    w: number;
    /** 网格高（格）。 */
    h: number;
    /** 初始火点数。 */
    fires: number;
    /** 风向单位向量（[dx, dy]），影响蔓延概率的方向加成。 */
    wind: readonly [number, number];
}
/** 5 关递进：街区更大、火点更多、风向逐关偏移。 */
export declare const LEVELS: readonly FireLevelConfig[];
/** 地物的引燃概率（空地恒 0）。 */
export declare function catchChance(kind: TileKind): number;
/** 地物燃值（火强度上限；空地 0）。 */
export declare function fuelOf(kind: TileKind): number;
/** 一格的完整状态：地物 + 当前火强度（0 无火）+ 是否已烧毁。 */
export interface FireCell {
    kind: TileKind;
    fire: number;
    burnt: boolean;
}
export interface FirefighterState {
    seed: number;
    level: number;
    grid: FireCell[][];
    /** 消防员格子坐标。 */
    px: number;
    py: number;
    /** 出生/回撤点（受伤后撤回此处）。 */
    startX: number;
    startY: number;
    facing: Direction;
    /** 是否正按住空格喷水。 */
    spraying: boolean;
    /** 受伤冷却剩余秒数（>0 时不能移动与喷水）。 */
    cooldown: number;
    /** 本关已烧毁的建筑数。 */
    levelLoss: number;
    /** 整局累计烧毁建筑数。 */
    totalLoss: number;
    /** 累计得分。 */
    score: number;
    /** 进入本关时的得分快照（重开本关回滚到该值）。 */
    scoreAtLevelStart: number;
    phase: FirePhase;
    /** 过关展示倒计时（phase === 'clear'）。 */
    clearTimer: number;
    fireTimer: number;
    waterTimer: number;
    t: number;
    rng: () => number;
}
/** 关卡派生 seed：同 (seed, level) 盘面完全一致。 */
export declare function mapSeed(seed: number, level: number): number;
/** 建立第 level 关的初始状态（score 从 0 起）。 */
export declare function createState(seed: number, level?: number): FirefighterState;
/** 重开本关：盘面重生成（同 seed 同布局），得分回滚到进关快照。 */
export declare function restartLevel(state: FirefighterState): void;
/** 过关结算分：损失建筑越多罚越重，保底 100。 */
export declare function levelBonus(loss: number): number;
/** 当前火点格数。 */
export declare function fireCount(state: FirefighterState): number;
/** 消防员能否站上 (x, y)：界内且非建筑（含废墟，建筑残骸不可通行）。 */
export declare function walkable(state: FirefighterState, x: number, y: number): boolean;
/** 朝 dir 移动一格：朝向总是更新；目标为建筑/出界则原地不动（绕行由
 * 玩家自行完成）；冷却中不移动。移动进火格立即受伤回撤。
 * @returns 是否实际移动。
 */
export declare function movePlayer(state: FirefighterState, dir: Direction): boolean;
/** 喷水锥形覆盖格集合（纯函数，不含界内检查）：面向方向第 d 格允许
 * 垂直向 ±⌊d/2⌋ 格，d = 1..range。 */
export declare function sprayCells(x: number, y: number, dir: Direction, range?: number): {
    x: number;
    y: number;
}[];
/** 结算一次喷水：锥形内每格火强度 -WATER_DMG，归零即熄灭。
 * @returns 熄灭的火点数。 */
export declare function applyWater(state: FirefighterState): number;
/** 风向对邻居引燃概率的倍率。 */
export declare function windMultiplier(wind: readonly [number, number], dx: number, dy: number): number;
/** 结算一次火势 tick：先增长/燃尽（快照遍历），再按概率流蔓延，最后
 * 检查消防员所在格起火受伤与全灭过关。 */
export declare function fireTick(state: FirefighterState): void;
/** 推进 dt 秒（上游已钳制 dt）。过关展示倒计时归零后自动装载下一关，
 * 第五关完成进入整局通关。 */
export declare function step(state: FirefighterState, dt: number): void;
