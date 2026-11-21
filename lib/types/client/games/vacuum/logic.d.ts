/**
 * 清扫规划（Vacuum）纯逻辑：seed 确定性的房间生成（家具阻挡 + 角落
 * 充电桩）、扫地机器人的移动/清扫/电量/充电规则、宠物猫的走动与碰撞，
 * 以及「覆盖全部可达格」的过关判定。不含任何 DOM/Canvas 依赖，随机
 * 全部来自注入 seed 的 mulberry32，同一 seed 完全可重放。
 */
/** 最后一关的关卡号。 */
export declare const FINAL_LEVEL = 5;
/** 方向。 */
export type VacuumDir = 'up' | 'down' | 'left' | 'right';
/** 对局状态：进行中 / 过关（本关） / 电量耗尽卡死。 */
export type VacuumStatus = 'playing' | 'won' | 'dead';
/** 房间网格：cells[i] 为 1 表示家具阻挡，dock 为充电桩（机器人起点）。 */
export interface VacuumRoom {
    cols: number;
    rows: number;
    cells: Uint8Array;
    dock: {
        x: number;
        y: number;
    };
}
/** 单关配置：尺寸 / 家具数 / 电量 / 充电次数 / 是否有猫。 */
export interface VacuumLevelConfig {
    cols: number;
    rows: number;
    furniture: number;
    battery: number;
    recharges: number;
    cat: boolean;
    /** 每移动多少步猫走一格。 */
    catEvery: number;
}
/** 宠物猫：随机游走的 1 格障碍。 */
export interface VacuumCat {
    x: number;
    y: number;
}
/** 一局状态。 */
export interface VacuumState {
    level: number;
    cfg: VacuumLevelConfig;
    room: VacuumRoom;
    /** 从充电桩可达的格标记（过关分母）。 */
    reachable: Uint8Array;
    /** 可达格总数。 */
    reachableCount: number;
    /** 已清扫标记。 */
    cleaned: Uint8Array;
    cleanedCount: number;
    robot: {
        x: number;
        y: number;
    };
    facing: VacuumDir;
    battery: number;
    recharges: number;
    /** 累计移动步数（驱动猫的节拍）。 */
    moveCount: number;
    cat: VacuumCat | null;
    status: VacuumStatus;
    /** 猫走动 / 弹开共用的注入随机源。 */
    rng: () => number;
}
/** tryMove 的结果快照。 */
export interface VacuumMoveResult {
    moved: boolean;
    /** 撞墙 / 撞家具：机器人不动、不耗电。 */
    blocked: boolean;
    /** 撞猫：-5 电量，猫被弹开，机器人不动。 */
    catBump: boolean;
    /** 本次移动踩进了新清扫的格。 */
    cleanedNew: boolean;
    recharged: boolean;
    won: boolean;
    dead: boolean;
}
/**
 * mulberry32 确定性随机源：同一 seed 产生同一 [0,1) 序列。
 * @param seed - 32 位无符号种子。
 * @returns 返回 [0,1) 浮点的函数。
 */
export declare function mulberry32(seed: number): () => number;
/**
 * 关卡配置：5 关递进——房间变大、家具更密、电量更紧、充电次数更少，
 * 第 4 关起出现宠物猫。
 * @param level - 关卡号（1..5），越界钳制到边界值。
 */
export declare function levelConfig(level: number): VacuumLevelConfig;
/** 判断 (x,y) 是否可通行（界内且非家具）。 */
export declare function isFloor(room: VacuumRoom, x: number, y: number): boolean;
/**
 * 从充电桩做 BFS，标记所有可达格（被家具完全围死的区域不计入）。
 * @param room - 房间网格。
 * @returns 可达标记数组和可达格总数。
 */
export declare function analyzeRoom(room: VacuumRoom): {
    reachable: Uint8Array;
    count: number;
};
/**
 * 用注入随机源生成一间房：充电桩固定 (0,0) 角落，家具随机撒放并保留
 * 桩位；可达格占比过低（大片区域被围死）时换一批布局重试，保证盘面
 * 可玩。同一 (rng 序列) 完全确定。
 * @param rng - 注入随机源。
 * @param cfg - 关卡配置。
 * @returns 生成的房间。
 */
export declare function generateRoom(rng: () => number, cfg: VacuumLevelConfig): VacuumRoom;
/**
 * 由已定房间（可手工构造，便于测试围死区域）+ 配置 + 随机源创建对局。
 * 机器人在充电桩出发，起点格视为已清扫。
 * @param room - 房间。
 * @param cfg - 关卡配置（cat 为 true 时在距桩 ≥3 的可达格放猫）。
 * @param rng - 注入随机源（猫走动共用）。
 */
export declare function createVacuumStateFromRoom(room: VacuumRoom, cfg: VacuumLevelConfig, rng: () => number): VacuumState;
/**
 * 创建某一关的完整对局（生成房间 + 放猫），同 seed 同关卡完全一致。
 * @param seed - 32 位种子。
 * @param level - 关卡号。
 */
export declare function createVacuumState(seed: number, level: number): VacuumState;
/**
 * 机器人朝 dir 移动一格的完整规则结算：
 * 界外/家具 = 阻挡不动不耗电；目标是猫 = -5 电量、猫被弹开、机器人
 * 不动；否则移动 -1 电量、经过即清扫（新格计数一次）。踩回充电桩且
 * 电量未满且有剩余次数时自动充满并消耗一次。每 catEvery 步猫走一格。
 * @param state - 对局状态。
 * @param dir - 方向。
 */
export declare function tryMove(state: VacuumState, dir: VacuumDir): VacuumMoveResult;
/**
 * 清扫覆盖率（0..1，分母为可达格总数）。
 * @param state - 对局状态。
 */
export declare function coverage(state: VacuumState): number;
