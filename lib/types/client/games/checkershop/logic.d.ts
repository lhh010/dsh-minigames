/**
 * 跳棋竞速 CheckersHop 纯逻辑：两人制中国跳棋（星盘的两极营区 + 中央
 * 六角区，共 81 格）。每方 10 枚棋子从己方营区出发，全部抵达对岸营区
 * 者胜该局，3 局 2 胜。走子只有两种：一步走到相邻空位（六向），或跳
 * 过相邻棋子（不分敌我）落到其正后方空位；跳后可继续连跳、也可在任
 * 一落点随时停止；全程不吃子（纯竞速）。防赖规则（简化判定）：棋子
 * 进入目标营区后锁定，只能在营区内移动腾位、不能移出。所有随机性经
 * mulberry32 种子注入；AI 为一层贪心（全子距目标和 + 链跳收益 + 种子
 * 噪声），同种子可确定性重放。
 *
 * 坐标系：轴向坐标 (q, r)，r 向下增大。中央六角区 = max(|q|,|r|,|q+r|)
 * <= 4（61 格）；上方营区（AI 起点）= r <= -5 的 10 格三角；下方营区
 * （你起点）= r >= 5 的 10 格三角。你的目标营区在上方，AI 的在下方。
 */
/** 胜一整场所需的局数（3 局 2 胜）。 */
export declare const ROUNDS_TO_WIN = 2;
/** 每方棋子数（营区三角恰好 10 格）。 */
export declare const PIECES_PER_SIDE = 10;
/** 轴向六方向：东、西、南、北、东南、西北。 */
export declare const DIRS: ReadonlyArray<readonly [number, number]>;
/** 一格的轴向坐标。 */
export interface Cell {
    q: number;
    r: number;
}
/** 是否属于上方营区（r <= -5，q 从 1 行 4 格收到 4 行 1 格的三角）。 */
export declare function inTopCamp(q: number, r: number): boolean;
/** 是否属于下方营区（r >= 5，q 从 -4 行 4 格收到 -1 行 1 格的三角）。 */
export declare function inBottomCamp(q: number, r: number): boolean;
/** 全部 81 格（r 从 -8 到 8、q 升序的稳定顺序）。 */
export declare const CELLS: Cell[];
/** (q, r) -> 格编号（0..80），不在盘上返回 -1。 */
export declare function cellId(q: number, r: number): number;
/** 邻接表：每格的六向在盘邻居（编号升序）。 */
export declare const ADJ: number[][];
/** 上/下方营区的格编号集合（升序）。 */
export declare const CAMP_TOP_IDS: number[];
export declare const CAMP_BOTTOM_IDS: number[];
/** 每格归属：0 中央区、1 上营区、2 下营区。 */
export declare const CAMP_FLAG: Uint8Array;
/** 一方：你（下方出发）或 AI（上方出发）。 */
export type Side = 'you' | 'ai';
/** 到上方营区（你的目标）的 BFS 距离表。 */
export declare const DIST_TO_TOP: number[];
/** 到下方营区（AI 的目标）的 BFS 距离表。 */
export declare const DIST_TO_BOTTOM: number[];
/** mulberry32：32 位种子 -> [0,1) 确定性伪随机函数。 */
export declare function mulberry32(seed: number): () => number;
export type CheckersHopPhase = 'play' | 'roundEnd' | 'matchEnd';
/** 一局（及整场）的全部可变状态；AI 与重放只依赖它。 */
export interface CheckersHopState {
    /** 每格占用：0 空、1 你、2 AI。 */
    board: number[];
    /** 当前行子方。 */
    turn: Side;
    /** play 进行中 / roundEnd 一局结束 / matchEnd 整场结束。 */
    phase: CheckersHopPhase;
    /** 当前局号（从 1 起）。 */
    roundNo: number;
    roundWinsYou: number;
    roundWinsAi: number;
    /** 整场胜者（matchEnd 时非空）。 */
    matchWinner: Side | null;
    /** 上一局胜者（roundEnd 时非空）。 */
    roundWinner: Side | null;
    /** 双方合计已行走子数（重放校验用）。 */
    moveNo: number;
    /** 种子随机流（AI 噪声）。 */
    rng: () => number;
}
/** 空盘（全部格清零）。 */
export declare function emptyBoard(): number[];
/** 初始摆子：你 10 子在下营区，AI 10 子在上营区。 */
export declare function initialBoard(): number[];
/** 用种子开一场新对局（第 1 局，你先行）。 */
export declare function createCheckersHop(seed: number): CheckersHopState;
/** 一方在某格集合外的棋子数（用于入营统计）。 */
export declare function countInTargetCamp(board: number[], side: Side): number;
/** 一方全部棋子到其目标营区的 BFS 距离和（越小越接近胜利）。 */
export declare function distSum(board: number[], side: Side): number;
/** 棋子是否已停在自己的目标营区（锁定）。 */
export declare function isLocked(board: number[], from: number): boolean;
/** 一步走：相邻空位。 */
export declare function stepsFor(board: number[], from: number): number[];
/**
 * 跳可达集（含链跳完整枚举）：从 from 出发，反复跳过相邻棋子（敌我
 * 皆可）到正后方空位；每个中间落点都算合法终点（可中途停止）。链上
 * 起点格视为空（棋子已拿起）。perHop 限制每一跳的落点范围（锁定子
 * 传"必须留在营区"）。
 */
export declare function jumpTargets(board: number[], from: number, perHop?: (id: number) => boolean): number[];
/**
 * 一枚棋子本回合的全部合法落点：一步走 + 链跳（每个落点都独立可
 * 选）。锁定规则：已停在自己目标营区的棋子，落点（及链跳每一跳的
 * 落点）必须仍在该营区内。
 */
export declare function legalTargets(board: number[], from: number): number[];
/** 一方是否还有任何合法走法。 */
export declare function hasAnyMove(board: number[], side: Side): boolean;
/** 走子并结算（from->to 必须是 legalTargets 的成员）。 */
export declare function applyMove(state: CheckersHopState, from: number, to: number): void;
/**
 * 玩家走子入口：轮到你且 from 是你的子且 to 合法时执行并返回 true，
 * 否则不动盘面返回 false。
 */
export declare function playerMove(state: CheckersHopState, from: number, to: number): boolean;
/** 局间开下一局：重摆棋子、清局胜者、双方轮换先行。 */
export declare function nextRound(state: CheckersHopState): void;
/** AI 的一个候选走法。 */
export interface CheckersHopMove {
    from: number;
    to: number;
}
/**
 * 通用贪心选法（确定性，AI 与自弈重放共用）：枚举 side 全部 (from,
 * to)（含链跳落点），打分 = 走后全子距离和 - 0.25 * 距离收益（链跳
 * 额外奖励）+ rng 噪声；取分最小者，平分取枚举序最先的。无棋可走返
 * 回 null。只读盘面（模拟后恢复）。
 */
export declare function chooseGreedyMove(state: CheckersHopState, side: Side): CheckersHopMove | null;
/** AI 选法：贪心的 AI 视角（轮到 AI 且对局进行中才返回非空）。 */
export declare function aiChooseMove(state: CheckersHopState): CheckersHopMove | null;
/**
 * AI 行子入口：选法并落子，返回所走的一步（跳手时返回 null 且已把
 * 行子权交还玩家）。
 */
export declare function aiTurn(state: CheckersHopState): CheckersHopMove | null;
