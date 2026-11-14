/**
 * 齿轮谜题 (Gears) 纯逻辑：关卡布局生成（固定骨架 + 注入随机只撒障碍）、
 * 网格邻接（上下左右即啮合）、从动力轮出发的 BFS 传动分析（相邻必反转、
 * 转速按齿数比连乘）、每个目标轮的方向/转速达标判定、放置与收回齿轮、
 * 过关计分与关卡推进。全部随机走注入 seed（mulberry32），确定性可测；
 * 无 DOM、无定时器。
 */
/** 网格坐标：r 行（向下增长），c 列（向右增长）。 */
export interface Cell {
    r: number;
    c: number;
}
/** 目标轮的方向要求：顺时针 / 逆时针 / 任意。 */
export type DirReq = 'cw' | 'ccw' | 'any';
/** 一格的种类：障碍 / 空位 / 动力轮 / 目标轮。 */
export type CellKind = 'void' | 'empty' | 'motor' | 'target';
/** 一个目标轮：位置与齿数固定，附带方向与最低转速要求。 */
export interface OutputReq {
    pos: Cell;
    teeth: number;
    /** 'cw' 与动力轮同向，'ccw' 反向，'any' 不限。 */
    dir: DirReq;
    /** 最低转速（°/s）；0 表示不考核转速。 */
    minSpeed: number;
}
/** 生成一关所需的全部 authored 骨架信息。 */
export interface LevelDef {
    w: number;
    h: number;
    motor: Cell;
    motorTeeth: number;
    outputs: OutputReq[];
    /** 保底走廊：这些空位永不撒成障碍，通关路径恒存在。 */
    corridor: Cell[];
    /** 非走廊、非固定格被撒成障碍的概率。 */
    voidChance: number;
}
/** 一关的完整盘面。 */
export interface GearsLevel {
    w: number;
    h: number;
    cells: CellKind[][];
    motor: Cell;
    motorTeeth: number;
    outputs: OutputReq[];
}
/** 备用齿轮槽的候选齿数（下标即槽位）。 */
export declare const CANDIDATE_TEETH: readonly number[];
/** 动力轮角速度（°/s），顺时针为正。 */
export declare const MOTOR_SPEED = 60;
/** 过关基础分（乘以关卡号）。 */
export declare const WIN_BASE = 100;
/** 每用一个齿轮扣的分（效率奖励下限 0）。 */
export declare const GEAR_COST = 20;
/** 效率奖励上限。 */
export declare const BONUS_MAX = 200;
export type GearsStatus = 'playing' | 'won';
export interface GearsState {
    /** 1-based 关卡号。 */
    level: number;
    score: number;
    /** 进入本关时的得分（R 重开时回滚到它，防止反复刷分）。 */
    levelStartScore: number;
    status: GearsStatus;
    /** 布局种子：同 seed 同关卡必生成同布局。 */
    seed: number;
    board: GearsLevel;
    /** placed[r][c]：空位上已放齿轮的齿数，null 为空。 */
    placed: (number | null)[][];
    /** 当前选中的候选槽下标（CANDIDATE_TEETH 索引）。 */
    selected: number;
    /** 放置/收回操作计数。 */
    moves: number;
}
/** mulberry32 确定性伪随机数发生器：同 seed 同序列，返回 [0,1)。 */
export declare function mulberry32(seed: number): () => number;
/** 关卡种子：不同 seed / 不同关卡号产生不同的布局序列。 */
export declare function levelSeed(seed: number, level: number): number;
/** 5 关递进：走廊变长、障碍变密、方向/转速要求逐步登场。 */
export declare const LEVEL_DEFS: LevelDef[];
/**
 * 按 authored 骨架生成一关：走廊与固定格保留，其余空格按 voidChance 撒障碍。
 * 走廊恒为空位，故每关必然可解。
 * @param def - 关卡骨架。
 * @param rng - 注入随机源。
 */
export declare function buildLevel(def: LevelDef, rng: () => number): GearsLevel;
/** 生成第 level 关（1-based；越界钳到 1..5）。 */
export declare function generateLevel(level: number, rng: () => number): GearsLevel;
/** (r,c) 的上下左右在界内邻格。 */
export declare function neighbors(r: number, c: number, w: number, h: number): Cell[];
/** (r,c) 处齿轮的齿数：动力轮/目标轮取固定值，空位取放置值。 */
export declare function teethAt(level: GearsLevel, placed: (number | null)[][], r: number, c: number): number;
/** 一枚被传动齿轮的解析结果：方向（1 顺时针 / -1 逆时针）与转速 °/s。 */
export interface Spin {
    dir: 1 | -1;
    speed: number;
}
/**
 * 从动力轮 BFS 求传动：网格相邻即啮合，相邻必反转，转速按
 * 齿数比连乘（子轮 = 父轮转速 × 父齿数 / 子齿数）。无齿轮的格不参与。
 * @returns 与盘面同形的 Spin | null 矩阵；null 表示该格未被传动。
 */
export declare function computeTransmission(level: GearsLevel, placed: (number | null)[][]): (Spin | null)[][];
/** 一个目标轮的考核结果。 */
export interface OutputCheck {
    powered: boolean;
    /** 传动到的方向（powered 时有效）。 */
    dir: 1 | -1;
    /** 传动到的转速（powered 时有效）。 */
    speed: number;
    /** 连通且方向、转速全部达标。 */
    met: boolean;
}
/** 考核一个目标轮：连通、方向要求、转速阈值。 */
export declare function checkOutput(level: GearsLevel, placed: (number | null)[][], output: OutputReq): OutputCheck;
/** 盘面上已放置的齿轮总数。 */
export declare function gearsUsed(placed: (number | null)[][]): number;
/** 过关得分：基础分 × 关卡号 + 用轮效率奖励。 */
export declare function winScore(level: number, usedGears: number): number;
/**
 * 在空位放置一枚 selected 槽齿数的齿轮（重复放置即换齿数）。
 * @returns 放置成功返回 true；障碍格、固定格或暂停/过关态返回 false。
 */
export declare function placeGear(state: GearsState, r: number, c: number, teeth: number): boolean;
/** 收回 (r,c) 上已放置的齿轮。 */
export declare function removeGear(state: GearsState, r: number, c: number): boolean;
/**
 * 过关判定：所有目标轮 met 时置 'won' 并加分（只加一次）。
 * @returns playing→won 转换返回 true。
 */
export declare function checkWin(state: GearsState): boolean;
/** 空的放置矩阵（换关 / 重开时重建）。 */
export declare function initPlaced(level: GearsLevel): (number | null)[][];
/** 过关后进入下一关：布局按种子重生成，分数与 levelStartScore 结转。 */
export declare function advanceLevel(state: GearsState): void;
/** 重开本关：同一布局（同 seed 同关卡），分数回滚到进关时。 */
export declare function restartLevel(state: GearsState): void;
/**
 * 新建一关状态。
 * @param level - 1-based 关卡号。
 * @param score - 结转得分。
 * @param seed - 布局种子。
 */
export declare function createGearsState(level?: number, score?: number, seed?: number): GearsState;
