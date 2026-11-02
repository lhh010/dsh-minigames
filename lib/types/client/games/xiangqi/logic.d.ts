/**
 * 中国象棋纯规则引擎：9x10 交叉点棋盘（索引 = row * 9 + col；row 0 为黑方底线
 * 在上，row 9 为红方底线在下，红方向 row 减小方向前进）。棋子用单字符表示：
 * 大写为红方（K 帅 A 仕 E 相 H 傌/马 R 俥/车 C 炮 P 兵），小写为黑方
 * （k 将 a 士 e 象 h 马 r 车 c 砲 p 卒）。所有函数均为纯函数：applyMove
 * 返回新的 Position，绝不改动传入状态。
 */
/** 红方 'r'，黑方 'b'。 */
export type Side = 'r' | 'b';
/** 棋子：大写红方，小写黑方；空点为 ''。 */
export type Piece = 'K' | 'A' | 'E' | 'H' | 'R' | 'C' | 'P' | 'k' | 'a' | 'e' | 'h' | 'r' | 'c' | 'p';
/** 完整局面：90 格棋盘 + 行棋方。 */
export interface Position {
    board: (Piece | '')[];
    turn: Side;
}
/**
 * 着法代数：[fromRow, fromCol, toRow, toCol]。
 * 棋子与被吃子由棋盘现场推导，不冗余存储。
 */
export type Move = readonly [number, number, number, number];
/** 棋盘行数（上下方向）。 */
export declare const ROWS = 10;
/** 棋盘列数（左右方向）。 */
export declare const COLS = 9;
/** 行列转一维索引。 */
export declare function idx(row: number, col: number): number;
/** 索引取行号。 */
export declare function rowOf(i: number): number;
/** 索引取列号。 */
export declare function colOf(i: number): number;
/** 是否在 9x10 棋盘内。 */
export declare function inBoard(row: number, col: number): boolean;
/** 棋子属于哪一方。 */
export declare function colorOf(p: Piece): Side;
/** 对方行棋方。 */
export declare function other(s: Side): Side;
/** 是否在 side 的九宫内（红 rows 7-9 / 黑 rows 0-2，cols 3-5）。 */
export declare function inPalace(row: number, col: number, side: Side): boolean;
/** 标准开局：黑上红下，红先行。 */
export declare function createStartPosition(): Position;
/** 空棋盘（测试构造基底）。 */
export declare function createEmptyPosition(turn?: Side): Position;
/**
 * 测试用稀疏局面构造器：entries 按 [row, col, piece] 放子。
 * @param entries - 棋子摆放列表。
 * @param opts - 行棋方（默认红）。
 * @returns 填好的局面。
 */
export declare function positionWith(entries: Array<[number, number, Piece]>, opts?: {
    turn?: Side;
}): Position;
/** 找 side 的将/帅，返回索引，找不到为 -1（合法对局不会发生）。 */
export declare function findKing(board: (Piece | '')[], side: Side): number;
/**
 * 将帅是否对脸：同列且中间无子。任何一方走出对脸局面均为违规。
 * @param board - 棋盘。
 * @returns 对脸返回 true。
 */
export declare function kingsFacing(board: (Piece | '')[]): boolean;
/**
 * (row, col) 是否被 by 方攻击（判将用，只对将/帅所在点调用）。
 * 覆盖：车直线、炮隔一子、马（含蹩腿）、兵前进与过河横吃、
 * 将帅照面（沿 open file 视作攻击，等价于对脸判负约束）。
 * @param board - 棋盘。
 * @param row - 目标行。
 * @param col - 目标列。
 * @param by - 攻击方。
 * @returns 被攻击返回 true。
 */
export declare function isSquareAttacked(board: (Piece | '')[], row: number, col: number, by: Side): boolean;
/** 当前行棋方是否被将军。 */
export declare function inCheck(pos: Position): boolean;
/**
 * 生成行棋方的全部伪合法着法（未过滤送将/对脸）。
 * 规则完整覆盖：车滑行、马蹩腿、炮隔子吃、象塞眼不过河、
 * 士斜行不出宫、将直行不出宫、兵过河横走不后退。
 * @param pos - 当前局面。
 * @returns 伪合法着法数组。
 */
export declare function generateMoves(pos: Position): Move[];
/**
 * 应用着法，返回新局面（纯函数，翻转行棋方）。
 * @param pos - 当前局面。
 * @param m - 着法。
 * @returns 走完后的新局面。
 */
export declare function applyMove(pos: Position, m: Move): Position;
/**
 * 完全合法着法：伪合法着法中，走完己方不被将军且将帅不对脸的着法。
 * @param pos - 当前局面。
 * @returns 合法着法数组。
 */
export declare function legalMoves(pos: Position): Move[];
/** 局面键（90 格摆放 + 行棋方），用于循环/重复检测。 */
export declare function positionKey(pos: Position): string;
export type Status = {
    kind: 'playing';
} | {
    kind: 'checkmate';
    winner: Side;
} | {
    kind: 'stalemate';
    winner: Side;
} | {
    kind: 'draw-repetition';
};
/**
 * 对局状态判定。中国象棋规则：无合法着法即判负 —— 被将军为将死（checkmate），
 * 未被将军为困毙（stalemate），两者赢家均为对方；长将判负在此简化为
 * 三次重复局面判和（repetitions >= 3）。
 * @param pos - 待判定局面。
 * @param repetitions - 当前局面（含本次）已出现的次数，默认 1。
 * @returns 对局状态。
 */
export declare function status(pos: Position, repetitions?: number): Status;
