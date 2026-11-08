/**
 * 连连看 Link 纯逻辑：N×M 网格上按注入 seed（mulberry32）确定性生成成对
 * 牌面；两张同图案牌之间存在「水平/垂直线段、最多两次拐弯、不穿过未消牌」
 * 的路径即可消除——路径由带转弯计数的 BFS 求得，场外一圈虚拟格可通行。
 * 无可连对时可主动洗牌（每关 3 次，保持牌面多重集并保证洗后可解）；全部
 * 消除过关，共 5 关递进（10×8 → 14×10）；计时倒扣分、超时或死局无洗牌判负。
 * 全部为纯函数 + 普通状态对象；index.ts 驱动输入与动画，单元测试直接驱动逻辑。
 */
/** 网格坐标（行 r、列 c；路径坐标允许 -1 / rows / cols 的场外虚拟圈）。 */
export interface Pos {
    r: number;
    c: number;
}
/** 对局状态：playing 进行中 / cleared 过关待进下一关 / won 全部通关 / lost 失败。 */
export type LinkStatus = 'playing' | 'cleared' | 'won' | 'lost';
export interface LinkState {
    /** 当前关卡（1..5）。 */
    level: number;
    rows: number;
    cols: number;
    /** rows x cols 牌面图案 id（0 起，图案池见渲染层）；null = 已消除的空格。 */
    grid: (number | null)[][];
    /** 当前选中格（行优先索引）；null = 未选。 */
    selected: number | null;
    /** 剩余洗牌次数。 */
    shufflesLeft: number;
    /** 剩余未消对数。 */
    pairsLeft: number;
    /** 本关剩余秒数与总秒数。 */
    timeLeft: number;
    timeLimit: number;
    /** 本关已进行秒数（计时倒扣分的扣分依据，过关时结算归零）。 */
    elapsed: number;
    /** 累计所得分（消除分 + 过关时间奖励 - 过关时结算的计时扣分），跨关累计。 */
    earned: number;
    status: LinkStatus;
    /** 最近一次成功消除的路径拐点序列（含两端），供连线动画使用。 */
    lastPath: Pos[] | null;
    /** 死局标记：还有牌但不存在任何可连对。 */
    deadlock: boolean;
    rng: () => number;
}
/** 5 关布局：行 x 列与挑战时长（秒），从 10x8 递进到 14x10。 */
export declare const LEVELS: readonly [{
    readonly rows: 8;
    readonly cols: 10;
    readonly time: 200;
}, {
    readonly rows: 8;
    readonly cols: 12;
    readonly time: 220;
}, {
    readonly rows: 9;
    readonly cols: 12;
    readonly time: 240;
}, {
    readonly rows: 9;
    readonly cols: 14;
    readonly time: 260;
}, {
    readonly rows: 10;
    readonly cols: 14;
    readonly time: 280;
}];
/** 图案池大小（渲染层按图案 id 取 emoji）。 */
export declare const POOL_SIZE = 20;
/** 某关可用的图案种数（第 1 关 12 种，每关 +2，封顶 20）。 */
export declare function levelKinds(level: number): number;
/** 每消一对的基础分（关卡越高每对分越高）。 */
export declare function pairValue(level: number): number;
/** 每关洗牌次数上限。 */
export declare const SHUFFLES_PER_LEVEL = 3;
/** 过关时每剩 1 秒的时间奖励分。 */
export declare const CLEAR_BONUS_PER_SEC = 2;
/**
 * mulberry32 确定性随机数生成器：同一 seed 产生同一序列，全部随机性都由它驱动。
 * @param seed - 32 位非负整数种子。
 * @returns 返回 [0, 1) 均匀随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/** 当前展示分数：累计所得分减去本关每整秒 1 分的计时倒扣，下限 0。 */
export declare function currentScore(state: LinkState): number;
/** 行优先索引转网格坐标（不校验边界）。 */
export declare function idxToPos(index: number, cols: number): Pos;
/**
 * 求两张牌之间「最多两次拐弯」的合法连接路径（带转弯计数的 BFS）。
 * 场外一圈虚拟格（-1 / rows / cols）恒可通行；线段不得穿过未消牌，终点牌格自身可进入。
 * @param grid - 当前牌面网格（null = 空格）。
 * @param rows - 网格行数。
 * @param cols - 网格列数。
 * @param a - 起点牌格。
 * @param b - 终点牌格。
 * @returns 折线拐点序列（含两端点，共线段已压缩）；a、b 同格或无路径时返回 null。
 */
export declare function findPath(grid: (number | null)[][], rows: number, cols: number, a: Pos, b: Pos): Pos[] | null;
/**
 * 两格是否为可消对：均为牌面、同图案且存在合法路径。
 * @param grid - 当前牌面网格（null = 空格）。
 * @param rows - 网格行数。
 * @param cols - 网格列数。
 * @param a - 第一张牌格。
 * @param b - 第二张牌格。
 */
export declare function canLink(grid: (number | null)[][], rows: number, cols: number, a: Pos, b: Pos): boolean;
/**
 * 暴力搜索第一对可连牌（同图案分组后两两试路径；牌面 ≤140 张足够快）。
 * @param state - 当前状态。
 * @returns 第一对可连牌坐标；无可连对（死局）时返回 null。
 */
export declare function findLinkablePair(state: LinkState): [Pos, Pos] | null;
/** 重算死局标记；死局且无洗牌次数时直接判负。 */
export declare function refreshDeadlock(state: LinkState): void;
/**
 * 建立指定关卡的全新状态；同 seed 同关卡结果完全一致（可测确定性）。
 * @param seed - mulberry32 种子，驱动全部随机性。
 * @param level - 起始关卡（1..5），默认 1。
 */
export declare function createLinkState(seed: number, level?: number): LinkState;
/**
 * 点击一张牌：选中/取消/尝试消除。第二张与选中同图案且路径可达即消除并记录
 * 路径；否则选中切换到这张牌。消除后重算死局；清场时结算过关（含时间奖励与
 * 计时扣分），第 5 关清场则通关。
 * @param state - 当前状态。
 * @param index - 行优先格索引。
 * @returns 'select' 切换选中 | 'deselect' 取消选中 | 'match' 消除一对 | 'none' 无效点击。
 */
export declare function tapTile(state: LinkState, index: number): 'select' | 'deselect' | 'match' | 'none';
/**
 * 主动洗牌：保持剩余牌面多重集与占格不变重排图案（选中清空），重试至出现可
 * 连对（最多 64 次）；每次消耗 1 次洗牌机会，洗后死局且无次数则判负。
 * @param state - 当前状态。
 * @returns 是否执行了洗牌（非进行中 / 无次数 / 已清场返回 false）。
 */
export declare function shuffleRemaining(state: LinkState): boolean;
/**
 * 计时推进：扣减剩余时间并累计已进行秒数；剩余时间归零判负。
 * @param state - 当前状态。
 * @param dtSec - 推进的秒数。
 * @returns 'lost' 已判负（含此前已负），否则 'ok'。
 */
export declare function tick(state: LinkState, dtSec: number): 'ok' | 'lost';
/**
 * 过关后进入下一关（累计分保留）。
 * @param state - 当前状态。
 * @returns 是否进入了下一关（仅在 cleared 状态有效）。
 */
export declare function advanceLevel(state: LinkState): boolean;
