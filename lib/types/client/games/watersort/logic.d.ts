/**
 * 水排序 WaterSort 纯逻辑：试管状态、倾倒规则、死局检测、DFS 求解器与
 * seed 生成器。全部为纯计算（随机源注入），渲染层与测试共用同一套规则。
 *
 * 数据约定：每根试管是一个颜色编号数组，下标 0 为管底、末位为管顶；
 * 每种颜色在盘面上恰好出现 TUBE_CAPACITY 层；空管是空数组。
 */
/** 每根试管的容量（层数）。 */
export declare const TUBE_CAPACITY = 4;
/** 关卡定义：色数与空管数，管数 = 色数 + 空管数。 */
export interface WaterSortLevelDef {
    /** 颜色种类数（每色恰好 TUBE_CAPACITY 层）。 */
    colors: number;
    /** 额外空管数。 */
    empties: number;
}
/** 关卡递进表：色数 3→8、空管 1→2，共 5 关。 */
export declare const LEVELS: readonly WaterSortLevelDef[];
/** mulberry32 确定性伪随机数发生器，返回 [0,1) 均匀分布。
 * @param seed - 非负整数种子。
 * @returns 产生 [0,1) 随机数的函数。 */
export declare function mulberry32(seed: number): () => number;
/** 一局游戏的完整局面（不可变快照，供历史栈与渲染直接持有）。 */
export interface WaterSortState {
    /** 1 基关卡号（已钳制到 LEVELS 范围）。 */
    level: number;
    /** 颜色种类数。 */
    colorCount: number;
    /** 每根试管的水层（下标 0 = 管底）；空管为空数组。 */
    tubes: number[][];
    /** 已用步数（每次成功倾倒 +1）。 */
    moves: number;
    /** 生成器给出的参考步数（求解器解长度）。 */
    par: number;
    /** 本关加管道具是否已用。 */
    extraUsed: boolean;
    /** playing 进行中；won 全部纯色完成。 */
    status: 'playing' | 'won';
}
/** 求解器结果：倾倒序列（[源管, 目标管]）与搜索节点数。 */
export interface SolveResult {
    moves: Array<[number, number]>;
    nodes: number;
}
/** 生成器输出：盘面、参考步数、一条可行解与尝试次数（0 = 兜底构造）。 */
export interface GeneratedLevel {
    tubes: number[][];
    par: number;
    solution: Array<[number, number]>;
    attempts: number;
}
/** 把关卡号钳制到 [1, LEVELS.length]。
 * @param n - 任意关卡号。
 * @returns 合法关卡号。 */
export declare function clampLevel(n: number): number;
/** 试管顶部连续同色段的长度；空管为 0。
 * @param tube - 单根试管的水层数组。
 * @returns 顶部连续同色层数。 */
export declare function topRun(tube: readonly number[]): number;
/** 倾倒合法性：源非空、非自倒、目标有空位、目标为空或顶色相同。
 * @param tubes - 盘面。
 * @param from - 源管下标。
 * @param to - 目标管下标。
 * @returns 是否合法。 */
export declare function canPour(tubes: readonly number[][], from: number, to: number): boolean;
/** 一次倾倒会移动的层数：min(源顶段长, 目标剩余空间)；非法为 0。
 * @param tubes - 盘面。
 * @param from - 源管下标。
 * @param to - 目标管下标。
 * @returns 移动层数（0 = 不移动）。 */
export declare function pourAmount(tubes: readonly number[][], from: number, to: number): number;
/** 执行倾倒，返回新盘面；非法返回 null。输入数组不被修改。
 * @param tubes - 盘面。
 * @param from - 源管下标。
 * @param to - 目标管下标。
 * @returns 新盘面，非法时 null。 */
export declare function pourTubes(tubes: readonly number[][], from: number, to: number): number[][] | null;
/** 试管是否已完成：整管纯色且装满。
 * @param tube - 单根试管的水层数组。
 * @returns 是否完成。 */
export declare function isTubeComplete(tube: readonly number[]): boolean;
/** 胜利判定：每根试管要么为空，要么整管纯色装满（每色恰好 4 层时
 * 等价于所有颜色各自集中成一管）。
 * @param tubes - 盘面。
 * @returns 是否完成。 */
export declare function isWon(tubes: readonly number[][]): boolean;
/** 倾倒是否“有意义”：排除两类永不推进局面的倒法——把整根纯管倒进
 * 空管（只是换个位置）、从已完成纯管倒出。求解与死局检测共用。
 * @param tubes - 盘面。
 * @param from - 源管下标。
 * @param to - 目标管下标。
 * @returns 是否有意义。 */
export declare function isUsefulPour(tubes: readonly number[][], from: number, to: number): boolean;
/** 是否还存在有意义的倒法。
 * @param tubes - 盘面。
 * @returns true 表示还有可行倒法。 */
export declare function hasAnyMove(tubes: readonly number[][]): boolean;
/** 向盘面追加 k 根空管（加管道具的纯函数形式）。
 * @param tubes - 盘面。
 * @param k - 追加空管数。
 * @returns 新盘面（浅拷贝）。 */
export declare function addTubes(tubes: readonly number[][], k: number): number[][];
/** 死局检测：未完成且没有任何有意义的倒法。
 * @param tubes - 盘面。
 * @returns 是否死局。 */
export declare function isDeadlocked(tubes: readonly number[][]): boolean;
/** DFS 求解器：带访问去重与节点预算，返回一条从当前盘面到完成的倾倒
 * 序列。预算耗尽与确实无解都返回 null（测试中用于验证生成盘面可解）。
 * @param tubes - 初始盘面。
 * @param maxNodes - 搜索节点预算（默认 120000）。
 * @returns 解与节点数，未找到则 null。 */
export declare function solveTubes(tubes: readonly number[][], maxNodes?: number): SolveResult | null;
/** seed 关卡生成器：把 4×色数 层随机洗牌分布进色数根管（空管留空），
 * 再用求解器验证可解且解不太浅；不合格换下一段随机流重摇（确定性）。
 * 随机尝试全败时退回两两交叉的必可解构造。
 * @param level - 关卡号（自动钳制）。
 * @param rng - 注入的随机源（mulberry32）。
 * @returns 盘面、参考步数、一条可行解与尝试次数。 */
export declare function generateLevel(level: number, rng: () => number): GeneratedLevel;
/** 按关卡与种子构造初始局面；同 (level, seed) 严格重现同一盘面。
 * @param level - 关卡号（自动钳制）。
 * @param seed - 随机种子。
 * @returns 初始局面。 */
export declare function createWaterSortState(level: number, seed: number): WaterSortState;
/** 带撤回栈与加管道具的一局控制器：封装“倾倒/撤回/加管/重开”，渲染
 * 层只读它的 state。倾倒与加管成功时把前一局面压入历史栈；道具标记
 * 不随撤回回退（用了就用了），但加出的空管会随撤回消失。
 */
export declare class WaterSortGame {
    private readonly level;
    private readonly seed;
    private cur;
    private readonly history;
    /** @param level - 关卡号（自动钳制）。
     *  @param seed - 随机种子，同种子同盘面。 */
    constructor(level: number, seed: number);
    /** 当前局面（只读快照，勿修改）。 */
    get state(): WaterSortState;
    /** 是否还有可撤回的步。 */
    canUndo(): boolean;
    /** 倾倒：合法则应用并压历史栈。
     * @param from - 源管下标。
     * @param to - 目标管下标。
     * @returns 是否成功。 */
    pour(from: number, to: number): boolean;
    /** 撤回一步（倾倒或加管）；仅进行中可用，道具标记不回退。
     * @returns 是否撤回了。 */
    undo(): boolean;
    /** 加管道具：追加一根空管，每关限一次；结束局面不可用。
     * @returns 是否成功。 */
    addTube(): boolean;
    /** 重开本关：同关卡同种子，重现同一盘面并清空历史。 */
    reset(): void;
    private pushHistory;
}
