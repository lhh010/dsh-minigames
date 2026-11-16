/**
 * 多米诺连锁 DominoRun 纯逻辑：侧视网格关卡（高度图 + 沟壑）、库存
 * 件的放置 / 拆除 / 撤回账目，以及确定性连锁传播模拟（逐拍步进，无
 * 随机、无 DOM，可独立单测）。渲染与交互在 render.ts / index.ts。
 */
/** 可放置件类型：普通骨牌 / 桥板（横跨沟壑）/ 加速器（跳过 1 格）。 */
export type PieceType = 'domino' | 'bridge' | 'booster';
/** 一件已放置库存件：占据某一列（每列至多一件）。 */
export interface Piece {
    type: PieceType;
    x: number;
}
/** 每关库存配额（摆放组合即谜题）。 */
export interface Inventory {
    domino: number;
    bridge: number;
    booster: number;
}
/**
 * 侧视关卡：terrain[x] 为第 x 列自底向上的实心格数（平台 / 台阶 /
 * 障碍块堆高），0 表示沟壑。pusherX 是起点推手所在实心列，bellX 是
 * 终点铃铛所在实心列。solution 为参考摆法（可解性由测试重放保证）。
 */
export interface Level {
    name: string;
    w: number;
    terrain: number[];
    pusherX: number;
    bellX: number;
    inventory: Inventory;
    solution: Array<{
        x: number;
        type: PieceType;
    }>;
}
/** mulberry32 确定性伪随机（种子注入，供骨牌点色等装饰用途）。 */
export declare function mulberry32(seed: number): () => number;
/**
 * 某列的传导有效高度：实心列取自身高度；沟壑列取其左侧最近实心列的
 * 高度（桥板在此高度铺板传力），左侧全空则为 0。
 * @param level 关卡
 * @param x 列号
 * @returns 有效高度（格数）
 */
export declare function effHeight(level: Level, x: number): number;
/** 连锁模拟状态：当前传导列 cursor 与已倒下列序 fallen。 */
export interface ChainState {
    cursor: number;
    fallen: number[];
}
/** 一步连锁事件：倒下一件 / 撞响铃铛 / 链条断裂 / 终态空步。 */
export type ChainEvent = {
    kind: 'fall';
    x: number;
} | {
    kind: 'win';
} | {
    kind: 'break';
    from: number;
} | {
    kind: 'idle';
};
/** 撤回记录：place 的逆操作是移回库存，remove 的逆操作是放回。 */
export interface UndoEntry {
    action: 'place' | 'remove';
    x: number;
    type: PieceType;
}
/** 游戏全部可测状态（纯数据，可整体快照比对）。 */
export interface GameState {
    level: Level;
    levelIndex: number;
    seed: number;
    pieces: Map<number, Piece>;
    used: Inventory;
    undoStack: UndoEntry[];
    phase: 'build' | 'chain';
    chain: ChainState | null;
    outcome: null | 'won' | 'lost';
}
/** 内置 5 关，难度递进：直道 → 单沟用桥 → 台阶+沟 → 双缝用加速器 →
 * 宽沟必须「加速器跳 + 双桥」组合。 */
export declare const LEVELS: Level[];
/** 取某一关（索引越界时钳制到末关）。 */
export declare function levelFor(index: number): Level;
/** 新开一局某关：空盘面、满库存、建造期。 */
export declare function createGameState(levelIndex: number, seed: number): GameState;
/**
 * 放置合法性（返回拒绝原因，null 表示可放）：界内、非起点/终点列、
 * 该列无件、库存充足；普通骨牌与加速器需实心支撑（沟壑不可放），
 * 桥板恰好只能铺在沟壑列上。
 */
export declare function placeReject(level: Level, pieces: Map<number, Piece>, used: Inventory, x: number, type: PieceType): string | null;
/**
 * 放置一件（成功即扣库存并记录撤回）。
 * @returns 拒绝原因；null 表示已放置
 */
export declare function placePiece(state: GameState, x: number, type: PieceType): string | null;
/**
 * 把某列的件移回库存（右键拆除）。
 * @returns 是否真的移除了一件
 */
export declare function removePiece(state: GameState, x: number): boolean;
/**
 * 撤回上一次摆放 / 拆除（仅建造期）。
 * @returns 是否真的撤回了一步
 */
export declare function undo(state: GameState): boolean;
/** 当前剩余库存（配额减已用）。 */
export declare function inventoryLeft(state: GameState): Inventory;
/** 从起点推手开始连锁模拟（清空上次结果，回到第 0 拍）。 */
export declare function startChain(state: GameState): void;
/**
 * 连锁推进一步（确定性）：普通件传到相邻列；加速器优先跳到 +2 列
 * （跳过 1 格），否则退回 +1；目标（含铃铛）与当前有效高度差须 ≤ 1。
 * 命中铃铛列且高度合格 = 过关；无有效目标 = 链断。终态再步进为 idle。
 */
export declare function stepChain(state: GameState): ChainEvent;
/** 结束 / 放弃连锁回到建造期（失败重摆、过关后再摆共用）。 */
export declare function resetToBuild(state: GameState): void;
/**
 * 逐列骨牌彩点配色（种子确定性）：mulberry32 派生的调色板下标。
 * @returns 长度为 level.w 的 accent 下标数组
 */
export declare function pipColors(level: Level, seed: number): number[];
/**
 * 过关得分：关卡基础分 + 剩余库存件数奖励（未用完的配件越多越好）。
 */
export declare function scoreFor(levelIndex: number, left: Inventory): number;
/**
 * 把某关参考摆法原样重放到一个新状态（每个位置都必须可放）。
 * @returns 已按参考摆法摆好的状态
 */
export declare function applySolution(levelIndex: number, seed: number): GameState;
