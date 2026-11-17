/**
 * 深海潜水（DeepDive）纯逻辑：push-your-luck 循环——岸上（船上）花资产升级
 * 氧气瓶 / 脚蹼 / 照明灯，下水后氧气消耗速率随当前深度线性增加（浅层省气、
 * 深层烧气）；宝物（珍珠/金币/沉箱）价值随所在深度递增，水母蜇人扣氧、
 * 暗流横向推移；随时可上浮回船结算（上浮本身不加额外氧耗，只耗时间与回合
 * 数），氧气归零仍在水下则本趟收获全部损失（救援上岸保命）。5 关海域由
 * seed 确定性布置，越深越富也越险，资产达标即进入下一关。全部随机走注入
 * seed 的 mulberry32，固定 1/60 子步推进，确定性可测、可重放。
 */
/** 海域横向宽度（逻辑像素，与渲染层共享坐标系）。 */
export declare const SEA_W = 360;
/** 固定物理子步长（秒）。 */
export declare const SUB_DT: number;
/** 单帧最大模拟时长（秒），超过按卡顿丢弃。 */
export declare const MAX_FRAME_DT = 0.05;
/** 氧气消耗基础速率（升/秒，水面处）。 */
export declare const O2_BASE = 1.6;
/** 氧气消耗随深度的线性系数（升/秒/米）。 */
export declare const O2_PER_M = 0.05;
/** 水母蜇一次扣除的氧气（升）。 */
export declare const STING_O2 = 16;
/** 被蜇后的无敌冷却（秒），防止连续判定。 */
export declare const STING_CD = 1.2;
/** 基础拾取半径（像素），照明灯每级加宽。 */
export declare const PICKUP_BASE = 15;
/** 照明灯每级增加的拾取半径。 */
export declare const PICKUP_STEP = 9;
/** 基础水平速度（像素/秒）。 */
export declare const SPEED_BASE = 95;
/** 脚蹼每级增加的水平速度。 */
export declare const SPEED_STEP = 26;
/** 基础垂直速度（米/秒，下潜与上浮同速）。 */
export declare const VERT_BASE = 46;
/** 脚蹼每级增加的垂直速度。 */
export declare const VERT_STEP = 9;
/** 基础氧气瓶容量（升）。 */
export declare const TANK_BASE = 110;
/** 氧气瓶每级增加的容量。 */
export declare const TANK_STEP = 45;
/** 每项升级的最高档位（0 起）。 */
export declare const MAX_TIER = 3;
/** 玩家横向半宽（碰撞与边界钳制用）。 */
export declare const DIVER_R = 12;
/** 宝物种类与基础价值（实际价值按所在深度放大）。 */
export type TreasureKind = 'pearl' | 'coin' | 'chest';
export declare const KIND_VALUE: Readonly<Record<TreasureKind, number>>;
/** 深度价值放大基准：价值 = 基础值 × (1 + 深度 / VALUE_DEPTH)。 */
export declare const VALUE_DEPTH = 80;
/** 升级项与首档价格（第 n 档价格 = 首档 × n）。 */
export type UpgradeKey = 'tank' | 'fins' | 'lamp';
export declare const UP_COST_BASE: Readonly<Record<UpgradeKey, number>>;
/** 5 关递进参数：海深、宝物数、水母数、暗流数、过关目标资产。 */
export declare const LEVELS: ReadonlyArray<Readonly<{
    depth: number;
    treasures: number;
    jellies: number;
    currents: number;
    target: number;
}>>;
/** 一件宝物：位置（横向像素 + 深度米）与已拾取标记。 */
export interface Treasure {
    x: number;
    d: number;
    kind: TreasureKind;
    /** 价值 = 基础值 × (1 + d / VALUE_DEPTH)，四舍五入取整。 */
    value: number;
    taken: boolean;
}
/** 一只水母：绕锚点正弦漂浮（相位与幅度由 seed 决定，运动由时间驱动）。 */
export interface Jelly {
    x: number;
    d: number;
    ampX: number;
    phase: number;
    spd: number;
}
/** 一条暗流：深度带 [from, to) 内以 vx 推移潜水员。 */
export interface Current {
    from: number;
    to: number;
    vx: number;
}
/** 升级档位表。 */
export interface Upgrades {
    tank: number;
    fins: number;
    lamp: number;
}
/** 阶段：船上（商店/结算）或潜水途中。 */
export type Phase = 'boat' | 'dive';
/** 上一趟结局：满载而袋 / 缺氧被救（收获损失）。 */
export type DiveResult = 'banked' | 'drowned';
export interface DeepDiveState {
    level: number;
    /** 整局基础 seed（关卡布置 seed 由它与关卡号混合派生）。 */
    seedBase: number;
    phase: Phase;
    /** 潜水员横向位置（像素）。 */
    x: number;
    /** 潜水员当前深度（米，0 = 水面）。 */
    depth: number;
    /** 输入轴：横向 -1/0/1、垂直 -1（上）/0/1（下）。 */
    inputX: number;
    inputY: number;
    /** 空格触发的自动上浮标记，触底前持续生效；按下键取消。 */
    ascending: boolean;
    /** 剩余氧气（升）。 */
    oxygen: number;
    /** 本趟未入袋的收获价值。 */
    haul: number;
    /** 已入袋总资产。 */
    assets: number;
    /** 已完成的潜水趟数（回合数）。 */
    dives: number;
    upgrades: Upgrades;
    treasures: Treasure[];
    jellies: Jelly[];
    currents: Current[];
    /** 本关目标资产。 */
    target: number;
    /** 通关（第 5 关达标）标记。 */
    won: boolean;
    /** 最近一次结束潜水的结局（渲染提示用）。 */
    lastResult: DiveResult | null;
    /** 被蜇无敌剩余秒数。 */
    stingCd: number;
    /** 累计模拟时间（秒，驱动水母漂浮）。 */
    time: number;
    /** 固定子步累积器（秒）。 */
    acc: number;
}
/**
 * mulberry32 确定性随机数生成器：海域布置等全部随机都走它，同 seed 序列
 * 完全一致，保证可测可重放。
 * @param seed - 32 位非负整数种子。
 * @returns 返回 [0, 1) 随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/** 派生能力值：氧气瓶容量（升）。 */
export declare function tankCapacity(up: Upgrades): number;
/** 派生能力值：水平速度（像素/秒）。 */
export declare function moveSpeed(up: Upgrades): number;
/** 派生能力值：垂直速度（米/秒）。 */
export declare function vertSpeed(up: Upgrades): number;
/** 派生能力值：拾取半径（像素），照明灯加宽。 */
export declare function pickRadius(up: Upgrades): number;
/** 指定深度处的氧气消耗速率（升/秒）＝基础 + 深度线性项。 */
export declare function o2Rate(depth: number): number;
/** 第 key 项第 (tier+1) 档的价格。 */
export declare function upgradeCost(key: UpgradeKey, tier: number): number;
/** 当前是否可购买第 key 项升级（船上、未满档、付得起）。 */
export declare function canBuy(state: DeepDiveState, key: UpgradeKey): boolean;
/**
 * 购买第 key 项升级：扣资产、升一档；不满足条件时不动。
 * @returns 是否购买成功。
 */
export declare function buyUpgrade(state: DeepDiveState, key: UpgradeKey): boolean;
/**
 * 创建整局状态：第 1 关、零资产零升级、船上待命。
 * @param seed - 基础 seed（32 位非负整数）。
 */
export declare function createDeepDiveState(seed: number): DeepDiveState;
/**
 * 从船上出发开始一趟潜水：氧气灌满、回水面中央、趟数 +1。
 * 船上阶段调用才有效。
 */
export declare function startDive(state: DeepDiveState): void;
/**
 * 推进一帧：内部按固定 SUB_DT 子步模拟，dt 超过 MAX_FRAME_DT 的部分丢弃。
 * @param state - 游戏状态（原地推进）。
 * @param dt - 帧间隔秒。
 */
export declare function stepDeepDive(state: DeepDiveState, dt: number): void;
/** 设置水平输入轴（-1/0/1）。 */
export declare function setInputX(state: DeepDiveState, dir: number): void;
/**
 * 设置垂直输入轴（-1 上 / 0 / 1 下）。按“下”同时取消空格的自动上浮，
 * 允许临门又贪一把再往下。
 */
export declare function setInputY(state: DeepDiveState, dir: number): void;
/** 空格：开始/维持自动上浮，直到水面或被 ↓ 取消。 */
export declare function startAscend(state: DeepDiveState): void;
