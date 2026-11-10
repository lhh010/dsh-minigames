/**
 * 弹跳机器人（Ricochet Robots）纯逻辑：10×10 盘面，外圈全墙 + 内部散墙
 * （生成器用 flood-fill 保证空闲格连通）。4 个不同色机器人 + 1 个目标格；
 * 每回合玩家选一个方向，所有机器人同时向该方向滑行，直到各自撞墙或撞上
 * 其他机器人（同伴 = 垫脚石）。指定颜色的机器人抵达目标格即过关，步数
 * 上限 limit = par + 4（par 由 BFS 预计算最优步数）。同向滑行按「先行者
 * 先落定」结算（朝移动方向最前的机器人先停），结果与处理顺序无关，
 * 可脱离 DOM 直接模拟验证。
 */
/** 逻辑画布宽度 px。 */
export declare const W = 440;
/** 逻辑画布高度 px。 */
export declare const H = 512;
/** 盘面边长格数（10×10）。 */
export declare const SIZE = 10;
/** 单格边长 px。 */
export declare const CELL = 36;
/** 盘面左上角 x px。 */
export declare const BOARD_X = 40;
/** 盘面左上角 y px。 */
export declare const BOARD_Y = 44;
/** 机器人数量（四色）。 */
export declare const ROBOT_COUNT = 4;
/** 生成器允许的最大 par（BFS 搜索深度上限同值）。 */
export declare const MAX_PAR = 12;
/** 一个滑动方向。 */
export type Dir = 'up' | 'down' | 'left' | 'right';
/** 格坐标。 */
export interface Pos {
    /** 行号（0 起）。 */
    row: number;
    /** 列号（0 起）。 */
    col: number;
}
/** 一局状态。 */
export interface RicochetState {
    /** 基础 seed（与 level 联合决定布局）。 */
    seed: number;
    /** 关卡号（从 1 起）。 */
    level: number;
    /** SIZE×SIZE 墙矩阵：true 为墙（外圈恒为墙）。 */
    walls: boolean[][];
    /** 机器人位置（索引即颜色索引 0-3）。 */
    robots: Pos[];
    /** 目标格。 */
    target: Pos;
    /** 必须抵达目标格的机器人（颜色）索引。 */
    targetRobot: number;
    /** 已走步数（每次有效滑动 +1）。 */
    moves: number;
    /** BFS 最优步数（计分与限步基准）。 */
    par: number;
    /** 步数上限（par + 4，超出未胜即失败）。 */
    limit: number;
    /** 当前潜在得分（胜利时定格为最终得分）。 */
    score: number;
    /** 是否已过关（目标机器人停在目标格）。 */
    won: boolean;
    /** 是否已失败（步数耗尽仍未过关）。 */
    failed: boolean;
}
/**
 * mulberry32 确定性伪随机数发生器。
 * @param seed - 32 位种子。
 * @returns 返回 [0,1) 随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/**
 * 深拷贝一局状态（undo 快照用）。
 * @param state - 原状态。
 * @returns 结构相等的新状态。
 */
export declare function cloneState(state: RicochetState): RicochetState;
/**
 * 统一滑动模拟：所有机器人同时向 dir 滑行到稳定。按「朝移动方向最前
 * 的机器人先落定」的顺序结算——先行者停定后成为后行者的阻挡物，同向
 * 机器人彼此不能穿越，故结果与机器人索引顺序无关。
 * @param walls - 墙矩阵。
 * @param robots - 机器人位置。
 * @param dir - 滑动方向。
 * @returns 滑定后的新位置数组；没有任何机器人移动返回 null。
 */
export declare function slideRobots(walls: boolean[][], robots: Pos[], dir: Dir): Pos[] | null;
/**
 * 计算当前潜在得分：基础分随关卡递增，超出 par 每步扣 25，下限 100。
 * @param level - 关卡号。
 * @param moves - 已走步数。
 * @param par - 最优步数。
 * @returns 得分。
 */
export declare function computeScore(level: number, moves: number, par: number): number;
/**
 * 执行一回合：所有机器人向 dir 滑行（纯函数：不改原状态）。
 * @param state - 当前状态。
 * @param dir - 滑动方向。
 * @returns 新状态（步数、胜负与得分更新）；没有任何机器人移动（无效
 * 回合）返回 null。
 */
export declare function slideAll(state: RicochetState, dir: Dir): RicochetState | null;
/**
 * BFS 最优步数：每步四方向全量滑动，目标为 targetRobot 停在 target。
 * @param walls - 墙矩阵。
 * @param robots - 机器人初始位置。
 * @param target - 目标格。
 * @param targetRobot - 目标机器人索引。
 * @param maxDepth - 搜索深度上限（默认 MAX_PAR）。
 * @returns 最短步数；超深度或不可解返回 -1。
 */
export declare function solve(walls: boolean[][], robots: Pos[], target: Pos, targetRobot: number, maxDepth?: number): number;
/**
 * 空闲格连通性检查：flood-fill 统计从首个空闲格可达的空闲格数。
 * @param walls - 墙矩阵。
 * @returns true 当所有空闲格彼此连通。
 */
export declare function freeCellsConnected(walls: boolean[][]): boolean;
/**
 * 生成第 level 关：确定性随机放内部散墙（数量随关卡递增）并校验空闲格
 * 连通，随机放 4 机器人与目标格，BFS 求 par，要求落在目标区间
 * [3+level, min(5+level, 12)]（关卡越深 par 越高、越紧）；不满足则换
 * 尝试重掷；耗尽时退回「可解且 par 最接近目标」的候选，保证返回有效
 * 关卡（par ≤ 12 可解）。
 * @param seed - 基础种子（与 level、尝试次数联合散列）。
 * @param level - 关卡号（从 1 起）。
 * @returns 初始状态（won=false、failed=false、moves=0）。
 */
export declare function generateLevel(seed: number, level: number): RicochetState;
