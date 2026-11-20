/**
 * 四色地图 FourColor 纯逻辑：以注入 seed 的 mulberry32 在网格上随机生长
 * 出 20-40 个连通区域并推导邻接表，同时回溯求出一组合法着色解（前三关
 * 四色、后两关限三色，三色图通过重试生成保证可解）。涂色、冲突检测、
 * 换色计步、过关判定与提示全部是确定性纯函数——无 DOM、无定时器。
 */
/** 确定性 mulberry32 伪随机数生成器（与库内其他游戏同款实现）。 */
export declare function mulberry32(seed: number): () => number;
/** 生成网格列数。 */
export declare const GRID_COLS = 30;
/** 生成网格行数。 */
export declare const GRID_ROWS = 20;
/** 关卡总数。 */
export declare const LEVEL_COUNT = 5;
/** 提示次数上限。 */
export declare const MAX_HINTS = 2;
/** 一关的静态参数。 */
export interface LevelConfig {
    /** 关卡号（1 起）。 */
    level: number;
    /** 区域数。 */
    regionCount: number;
    /** 可用颜色数（4 或 3）。 */
    paletteSize: number;
    /** 生成网格列数。 */
    gridCols: number;
    /** 生成网格行数。 */
    gridRows: number;
}
/** 一张程序生成的邻接地图及其附带解。 */
export interface FourColorMap {
    /** 网格列数。 */
    gridCols: number;
    /** 网格行数。 */
    gridRows: number;
    /** 区域总数。 */
    regionCount: number;
    /** 可用颜色数。 */
    paletteSize: number;
    /** 每个网格单元所属区域下标（长度 gridCols*gridRows，均为有效区域）。 */
    cellRegion: number[];
    /** 邻接表：每个区域的相邻区域下标（升序、去重、无自环、对称）。 */
    adjacency: number[][];
    /** 附带的一组合法解（每个区域一个颜色号，相邻不同色）。 */
    solution: number[];
}
/** 一局进行中的状态（不可变风格：操作函数返回新状态）。 */
export interface FourColorState {
    /** 本局地图。 */
    map: FourColorMap;
    /** 各区域当前颜色，-1 表示未涂。 */
    colors: number[];
    /** 换色次数（对已涂区域改色每次 +1；首涂与清除不计）。 */
    repaints: number;
    /** 已用提示次数。 */
    hintsUsed: number;
}
/** 一次提示的结果：应用后的新状态 + 被点亮的区域与颜色。 */
export interface HintResult {
    /** 应用提示（含次数 +1）后的新状态。 */
    state: FourColorState;
    /** 被提示的区域下标。 */
    region: number;
    /** 提示给出的颜色号。 */
    color: number;
}
/**
 * 关卡参数：区域数与颜色数按 5 关递进；越界关卡号收敛到 [1, 5]。
 * @param level - 关卡号（1 起，越界取边界值）。
 * @returns 该关的区域数 / 颜色数 / 网格尺寸。
 */
export declare function levelConfig(level: number): LevelConfig;
/**
 * 从网格归属推导邻接表：相邻单元归属不同即记一对邻接，结果升序去重。
 * @param cellRegion - 每个单元的区域归属。
 * @param regionCount - 区域总数。
 * @returns 每个区域的邻接表。
 */
export declare function deriveAdjacency(cellRegion: number[], regionCount: number): number[][];
/**
 * DSATUR 回指着色：优先给「相邻已用颜色数最多（并列取度数最大）」的未涂
 * 节点上色；预算耗尽按失败返回，供生成层重试。
 * @param adj - 邻接表。
 * @param colorCount - 可用颜色数。
 * @param preset - 可选的预涂颜色（≥0 视为锁定；预涂自身冲突直接失败）。
 * @param budget - 回溯步数预算。
 * @returns 一组合法着色，或 null（无解 / 预涂冲突 / 超预算）。
 */
export declare function solveColors(adj: number[][], colorCount: number, preset?: number[], budget?: number): number[] | null;
/**
 * 生成一关地图：四色关用随机生长 + 回溯求附带解（无解 / 超预算时换派生
 * 种子重试，最多 GEN_ATTEMPTS 次）；三色关用构造性交错砖墙（必三色可解）。
 * @param seed - 注入的随机种子。
 * @param level - 关卡号（越界收敛）。
 * @returns 带合法解的地图。
 */
export declare function generateMap(seed: number, level: number): FourColorMap;
/**
 * 开一局：生成地图、清空涂色。
 * @param seed - 注入的随机种子。
 * @param level - 关卡号。
 * @returns 初始状态。
 */
export declare function createState(seed: number, level: number): FourColorState;
/**
 * 逐区域冲突标记：已涂且存在同色相邻区域即为冲突（红显依据）。
 * @param state - 当前状态。
 * @returns 每个区域一个布尔值。
 */
export declare function conflicts(state: FourColorState): boolean[];
/**
 * 给一个区域涂色：首涂不计换色，对已涂区域改色每次 +1，涂同色为 no-op；
 * 非法区域 / 颜色返回原状态。
 * @param state - 当前状态。
 * @param region - 区域下标。
 * @param color - 颜色号。
 * @returns 新状态（或原状态）。
 */
export declare function paintRegion(state: FourColorState, region: number, color: number): FourColorState;
/**
 * 清除一个区域的颜色（右键）；未涂区域与清除均不计换色。
 * @param state - 当前状态。
 * @param region - 区域下标。
 * @returns 新状态（或原状态）。
 */
export declare function clearRegion(state: FourColorState, region: number): FourColorState;
/**
 * 过关判定：全部区域已涂且无任何冲突。
 * @param state - 当前状态。
 * @returns 是否过关。
 */
export declare function isComplete(state: FourColorState): boolean;
/**
 * 使用一次提示：优先指向第一个未涂区域（否则第一个冲突区域），颜色取
 * 「以当前无冲突涂色为约束求出的完整解」在该处的取值——与玩家已有涂色
 * 兼容；无完整解时退回第一个不与相邻已涂区域撞色的颜色。提示直接替该
 * 区域上色且不计换色。
 * @param state - 当前状态。
 * @returns 提示结果，或 null（次数用尽 / 已过关）。
 */
export declare function giveHint(state: FourColorState): HintResult | null;
/**
 * 邻接表平均度数（关卡难度递进的可测指标）。
 * @param adj - 邻接表。
 * @returns 平均度数。
 */
export declare function averageDegree(adj: number[][]): number;
