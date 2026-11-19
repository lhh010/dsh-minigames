/**
 * 残局挑战 ChessEnd 纯逻辑：8x8 国际象棋残局状态机与受限深度的确定性
 * 搜索引擎。规则简化：不支持王车易位与吃过路兵；兵升变自动成后。
 * 防守方（黑方）由引擎代走：黑方 1 层 + 白方最强应手评估，带种子噪声；
 * 白方提示用白 2 层 + 黑 1 层搜索。所有随机经 mulberry32 注入种子，
 * 同种子下整局走子序列可精确重放。
 */
/** 棋盘：64 字符字符串，索引 0 = a8、63 = h1；'.' 为空，大写为白方。 */
export type Board = string;
/** 行棋方。 */
export type Side = 'w' | 'b';
/** 一步棋：起止格索引。 */
export interface ChessMove {
    from: number;
    to: number;
}
/** 单个残局题目。 */
export interface ChessEndPuzzle {
    /** 唯一 id。 */
    id: string;
    /** 中文标题。 */
    title: string;
    /** 目标类型：将杀 / 兵升变 / 得子。 */
    goal: 'mate' | 'promote' | 'material';
    /** 目标的一句话说明（HUD 显示）。 */
    goalText: string;
    /** 参考步数：≤ PAR 满分，每超 1 步扣 10 分。 */
    par: number;
    /** rank8 → rank1 每行 8 字符的初始局面。 */
    rows: string[];
    /** goal 为 material 时，白方子力分差需达到的最小值。 */
    advantage?: number;
}
/** 将杀分值（越大越接近立即将杀）。 */
export declare const MATE_SCORE = 100000;
/** 防守方决策噪声幅度（厘兵单位，mulberry32 驱动）。 */
export declare const ENGINE_NOISE = 36;
/**
 * mulberry32 伪随机数发生器：种子确定则序列确定。
 * @param seed - 非负整数种子。
 * @returns 返回 [0, 1) 随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/**
 * 由 8 行棋子字符串构造棋盘。
 * @param rows - rank8 → rank1 每行 8 字符，'.' 为空。
 * @returns 64 字符棋盘。
 */
export declare function parseRows(rows: string[]): Board;
/**
 * 棋子归属方。
 * @param piece - 棋子字符（'.' 为空）。
 * @returns 'w' / 'b' / ''（空）。
 */
export declare function colorOf(piece: string): Side | '';
/**
 * 格名的代数记法（索引 0 → 'a8'）。
 * @param sq - 格索引。
 * @returns 如 'e2' 的坐标名。
 */
export declare function sqName(sq: number): string;
/**
 * 某格是否被指定方攻击（用于将军与王安全判定）。
 * @param board - 当前棋盘。
 * @param sq - 被查格索引。
 * @param by - 攻击方。
 * @returns 被攻击返回 true。
 */
export declare function attacksSquare(board: Board, sq: number, by: Side): boolean;
/**
 * 某方王的格索引（供渲染将军红圈等定位）。
 * @param board - 当前棋盘。
 * @param side - 查找方。
 * @returns 格索引，找不到返回 -1。
 */
export declare function findKing(board: Board, side: Side): number;
/**
 * 某方是否被将军。
 * @param board - 当前棋盘。
 * @param side - 被查方。
 */
export declare function inCheck(board: Board, side: Side): boolean;
/**
 * 合法走法：伪合法过滤掉走后己王被攻击的走法。
 * @param board - 当前棋盘。
 * @param side - 行棋方。
 */
export declare function legalMoves(board: Board, side: Side): ChessMove[];
/** 落子结果：新棋盘 + 被吃子 + 是否发生升变（自动成后）。 */
export interface MoveResult {
    board: Board;
    captured: string;
    promoted: boolean;
}
/**
 * 落子（不可变：返回新棋盘）。兵到达底线自动升变为后；不支持易位与吃过路兵。
 * @param board - 走之前的棋盘。
 * @param move - 起止格。
 * @returns 新棋盘与被吃子信息。
 */
export declare function makeMove(board: Board, move: ChessMove): MoveResult;
/**
 * 某方是否被将杀（被将军且无合法走法）。
 * @param board - 当前棋盘。
 * @param side - 被查方。
 */
export declare function isCheckmate(board: Board, side: Side): boolean;
/**
 * 某方是否被逼和（未被将军且无合法走法）。
 * @param board - 当前棋盘。
 * @param side - 被查方。
 */
export declare function isStalemate(board: Board, side: Side): boolean;
/**
 * 子力分差（白方视角，厘兵）。
 * @param board - 当前棋盘。
 * @returns 白方子力总和减黑方子力总和。
 */
export declare function materialDiff(board: Board): number;
/**
 * 完整静态评估 = 子力 + 兵推进 + 王安全（白方视角，确定性）。
 * @param board - 当前棋盘。
 * @returns 分值，越大白方越优。
 */
export declare function evaluate(board: Board): number;
/** 白方搜索结果。 */
export interface SearchResult {
    move: ChessMove | null;
    score: number;
}
/**
 * 白方搜索：己方 2 层 + 对方 1 层（白 → 黑 → 白 → 静态评估），将杀按
 * 步数递减计分优先选择，遍历顺序固定，完全确定。
 * @param board - 白方行棋的棋盘。
 * @returns 最优走法与分值；无合法走法时 move 为 null。
 */
export declare function searchWhite(board: Board): SearchResult;
/**
 * 黑方防守走法：黑 1 层，每个候选以「白方最强应手（含将杀识别）」打分，
 * 加 mulberry32 噪声后取最大；噪声为 0 时不消耗随机数，任意种子同走法。
 * @param board - 黑方行棋的棋盘。
 * @param rng - 种子随机源。
 * @param noise - 噪声幅度（0 表示完全确定性）。
 * @returns 黑方走法；黑无合法走法返回 null。
 */
export declare function defenderMove(board: Board, rng: () => number, noise: number): ChessMove | null;
/** 内置 8 个经典残局：将杀 / 升变 / 得子训练，白方行棋。 */
export declare const PUZZLES: ChessEndPuzzle[];
/** 对局状态：pure 数据快照，供 render 与测试直接消费。 */
export interface ChessEndState {
    /** 题目与索引。 */
    puzzle: ChessEndPuzzle;
    puzzleIndex: number;
    /** 当前棋盘。 */
    board: Board;
    /** 玩家已走步数。 */
    moveCount: number;
    /** 悔棋栈：每次玩家走子前的棋盘快照。 */
    history: Board[];
    /** 对局状态。 */
    status: 'playing' | 'won' | 'draw' | 'lost';
    /** 底栏提示消息（非法走法 / 将军 / 结果）。 */
    message: string;
    /** 过关得分（未过关为 0）。 */
    score: number;
    /** 剩余提示次数。 */
    hintsLeft: number;
    /** 最近一次玩家走子与引擎应手（高亮用）。 */
    lastPlayer: ChessMove | null;
    lastReply: ChessMove | null;
    /** 种子随机源（防守方噪声）。 */
    rng: () => number;
}
/** 玩家走子结果。 */
export interface ChessEndMoveResult {
    ok: boolean;
    reason: string;
    state: ChessEndState;
}
/**
 * PAR 计分：≤ PAR 满分 100，每超 1 步扣 10，下限 20。
 * @param par - 参考步数。
 * @param moves - 实际步数。
 */
export declare function computeScore(par: number, moves: number): number;
/**
 * 目标是否达成（在玩家走子后的棋盘上判定）。
 * @param board - 玩家走子后的棋盘。
 * @param puzzle - 题目。
 * @param promoted - 这步是否发生升变。
 */
export declare function goalMet(board: Board, puzzle: ChessEndPuzzle, promoted: boolean): boolean;
/**
 * 白方某棋子的合法落点。
 * @param board - 当前棋盘。
 * @param from - 起点格索引。
 * @returns 合法落点索引数组（起点无白子为空）。
 */
export declare function legalTargets(board: Board, from: number): number[];
/**
 * 走法的人类可读标签（如 'Qe2-e8' / 'Rxa7'）。
 * @param board - 走之前的棋盘。
 * @param move - 走法。
 */
export declare function moveLabel(board: Board, move: ChessMove): string;
/**
 * 通用开局：以题目 + 种子构造对局状态。
 * @param puzzle - 题目定义。
 * @param puzzleIndex - 题目索引（HUD / 切题用）。
 * @param seed - 防守方噪声种子。
 */
export declare function createState(puzzle: ChessEndPuzzle, puzzleIndex: number, seed: number): ChessEndState;
/**
 * 以内置题库开局。
 * @param puzzleIndex - 题目索引（越界取模）。
 * @param seed - 防守方噪声种子。
 */
export declare function createChessEndState(puzzleIndex: number, seed: number): ChessEndState;
/**
 * 玩家（白方）走子：非法即拒绝并给出理由；合法则落子、判目标，未达目标
 * 由引擎代走黑方应手。返回新状态（原状态不变）。
 * @param state - 当前状态。
 * @param from - 起点格索引。
 * @param to - 终点格索引。
 */
export declare function applyPlayerMove(state: ChessEndState, from: number, to: number): ChessEndMoveResult;
/**
 * 悔棋：回退「玩家走子 + 引擎应手」一整回合；仅在未结束时可用。
 * @param state - 当前状态。
 * @returns 回退后的新状态（无可悔时原样返回）。
 */
export declare function undoMove(state: ChessEndState): ChessEndState;
/** 提示结果：消耗一次配额并给出白方参考走法。 */
export interface HintResult {
    state: ChessEndState;
    move: ChessMove | null;
    label: string;
}
/**
 * 请求一步参考走法（白 2 层 + 黑 1 层搜索），配额 3 次；用尽或对局结束
 * 返回 move 为 null 且状态不变。
 * @param state - 当前状态。
 */
export declare function requestHint(state: ChessEndState): HintResult;
