/**
 * 交通堵塞（Rush Hour）纯逻辑：6×6 盘面，若干水平 / 垂直车辆（长 2-3
 * 格）只能沿自身朝向前后滑动；红色目标车位于出口行，出口在右侧边缘。
 * generateLevel(seed, level) 用 mulberry32 确定性随机布置车辆，BFS 求解
 * 验证可解且最短步数落在目标区间（关卡越高等步数越长），不可解或不在
 * 区间则重掷。moveVehicle 为纯函数（返回新状态或 null），胜利条件为红
 * 车右端到达第 SIZE 列（开出出口）；计分 = 基础分 - 超出最优步数的惩罚。
 * 同一 seed 与 level 必然生成同一关卡，可脱离 DOM 直接模拟验证。
 */
/** 逻辑画布宽度 px。 */
export declare const W = 440;
/** 逻辑画布高度 px。 */
export declare const H = 484;
/** HUD 条高度 px（含在 H 内）。 */
export declare const HUD_H = 34;
/** 盘面边长格数（6×6）。 */
export declare const SIZE = 6;
/** 单格边长 px。 */
export declare const CELL = 62;
/** 盘面左上角 x px。 */
export declare const BOARD_X = 34;
/** 盘面左上角 y px。 */
export declare const BOARD_Y = 50;
/** 一辆车：朝向、长度、固定轴坐标（水平车所在行 / 垂直车所在列）与可动轴坐标（水平车左端列 / 垂直车顶端行）。 */
export interface Vehicle {
    /** true 为水平车（沿行左右滑动），false 为垂直车（沿列上下滑动）。 */
    horizontal: boolean;
    /** 车长（2 或 3 格）。 */
    length: number;
    /** 固定轴坐标：水平车的行号 / 垂直车的列号。 */
    fixed: number;
    /** 可动轴坐标：水平车最左格列号 / 垂直车最上格行号。 */
    pos: number;
    /** 是否红色目标车（唯一，长 2 格，水平，位于出口行）。 */
    red: boolean;
}
/** 一局状态：车辆布局、步数、BFS 最优步数与胜利标志。 */
export interface RushHourState {
    /** 基础 seed（与 level 联合决定布局）。 */
    seed: number;
    /** 关卡号（从 1 起）。 */
    level: number;
    /** 出口所在行（0-5）。 */
    exitRow: number;
    /** 车辆列表；索引 0 恒为红色目标车。 */
    vehicles: Vehicle[];
    /** 已走步数（每次有效移动 +1）。 */
    moves: number;
    /** BFS 最短解题步数（计分基准）。 */
    optimal: number;
    /** 当前潜在得分（胜利时定格为最终得分）。 */
    score: number;
    /** 是否已胜利（红车开出出口）。 */
    won: boolean;
}
/**
 * mulberry32 确定性伪随机数发生器。
 * @param seed - 32 位种子。
 * @returns 返回 [0,1) 随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/**
 * 车辆占据的格子（fixed 轴 + pos..pos+length-1）。
 * @param vehicle - 车辆。
 * @returns [row, col] 数组，长度等于车长。
 */
export declare function vehicleCells(vehicle: Vehicle): Array<[number, number]>;
/**
 * 命中检测：返回占据 (row, col) 格的车辆索引。
 * @param vehicles - 车辆列表。
 * @param row - 行号。
 * @param col - 列号。
 * @returns 车辆索引，空格返回 null。
 */
export declare function vehicleAt(vehicles: Vehicle[], row: number, col: number): number | null;
/**
 * BFS 最短解题步数：每步把任意一辆车滑到沿朝向可达的任一新位置；目标
 * 为红车右端列 pos+length === SIZE（开出右侧出口）。
 * @param vehicles - 车辆布局。
 * @returns 最短步数；不可解返回 -1。
 */
export declare function solve(vehicles: Vehicle[]): number;
/**
 * 计算当前潜在得分：基础分随关卡递增，超出最优步数每步扣 25，下限 100。
 * 胜利前按「若此刻通关」计，胜利后为最终得分。
 * @param level - 关卡号。
 * @param moves - 已走步数。
 * @param optimal - 最优步数。
 * @returns 得分。
 */
export declare function computeScore(level: number, moves: number, optimal: number): number;
/**
 * 深拷贝一局状态（undo 快照用）。
 * @param state - 原状态。
 * @returns 结构相等的新状态。
 */
export declare function cloneState(state: RushHourState): RushHourState;
/**
 * 尝试把索引 vehicleIdx 的车沿朝向滑动到 targetPos（纯函数：不改原状态）。
 * @param state - 当前状态。
 * @param vehicleIdx - 车辆索引。
 * @param targetPos - 目标可动轴坐标（水平车左端列 / 垂直车顶端行）。
 * @returns 新状态（含步数、得分与胜利更新）；越界、路径被阻挡或目标与
 * 当前位置相同返回 null。
 */
export declare function moveVehicle(state: RushHourState, vehicleIdx: number, targetPos: number): RushHourState | null;
/**
 * 生成第 level 关：确定性随机布置含红车的车辆（六成概率在红车前方投放
 * 垂直阻挡车以加深谜题），BFS 验证可解且最短步数落在目标区间
 * [targetMin, targetMax]（区间随关卡上移，上限 20：实测随机布局的最优
 * 步数很难超过 27，越深越稀缺，故 targetMin ≥ 12 的高难关卡只保下界）；
 * 不满足则换种子重掷；尝试耗尽时退回「可解且步数最大」的候选，保证
 * 必然返回有效关卡。
 * @param seed - 基础种子（与 level、尝试次数联合散列）。
 * @param level - 关卡号（从 1 起）。
 * @returns 初始状态（won=false、moves=0、score=基础分）。
 */
export declare function generateLevel(seed: number, level: number): RushHourState;
