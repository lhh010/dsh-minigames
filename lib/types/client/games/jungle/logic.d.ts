/**
 * 斗兽棋（Jungle）纯规则引擎：7 列 x 9 行方格棋盘（索引 = row * 7 + col；
 * row 0 为黑方底线在上，row 8 为红方底线在下，红方向 row 增大方向前进）。
 * 棋子用单字符表示：大写为红方（E 象 L 狮 T 虎 P 豹 W 狼 D 狗 C 猫 M 鼠），
 * 小写为黑方。等级 1-8：鼠 1 猫 2 狗 3 狼 4 豹 5 虎 6 狮 7 象 8；
 * 高级或同级可吃低级，鼠可吃象而象不可吃鼠。地形：双方各一个兽穴与
 * 三个陷阱；中央两块 2x3 河流（rows 3-5，cols 1/2 与 4/5）——仅鼠可
 * 入水，狮虎可沿直线跳河，但途中任一水格有鼠（无论哪方）即被截断。
 * 所有函数均为纯函数：applyMove 返回新 Position，绝不改动传入状态。
 */
/** 红方 'r'，黑方 'b'。 */
export type Side = 'r' | 'b';
/** 棋子：大写红方，小写黑方；空格为 ''。 */
export type Piece = 'E' | 'L' | 'T' | 'P' | 'W' | 'D' | 'C' | 'M' | 'e' | 'l' | 't' | 'p' | 'w' | 'd' | 'c' | 'm';
/** 完整局面：63 格棋盘 + 行棋方。 */
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
export declare const ROWS = 9;
/** 棋盘列数（左右方向）。 */
export declare const COLS = 7;
/** 行列转一维索引。 */
export declare function idx(row: number, col: number): number;
/** 索引取行号。 */
export declare function rowOf(i: number): number;
/** 索引取列号。 */
export declare function colOf(i: number): number;
/** 是否在 7x9 棋盘内。 */
export declare function inBoard(row: number, col: number): boolean;
/** 棋子属于哪一方。 */
export declare function colorOf(p: Piece): Side;
/** 对方行棋方。 */
export declare function other(s: Side): Side;
/** 等级表：鼠 1、猫 2、狗 3、狼 4、豹 5、虎 6、狮 7、象 8。 */
export declare const RANK: Record<Piece, number>;
/** 黑方兽穴（row 0 正中）。 */
export declare const BLACK_DEN: number;
/** 红方兽穴（row 8 正中）。 */
export declare const RED_DEN: number;
/** 黑方三陷阱（兽穴左、右、前一格）。 */
export declare const BLACK_TRAPS: readonly number[];
/** 红方三陷阱（兽穴左、右、前一格）。 */
export declare const RED_TRAPS: readonly number[];
/** 是否为河流格。 */
export declare function isWater(i: number): boolean;
/** side 方兽穴的索引。 */
export declare function denOf(side: Side): number;
/** i 是否 side 方的陷阱格。 */
export declare function isTrapOf(side: Side, i: number): boolean;
/** 标准开局：黑上红下，红先行（与上方黑棋呈中心对称）。 */
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
/**
 * 吃子判定（不含入水限制）。
 * 规则：攻方在水里不能吃岸上的子；守方站在攻方陷阱里可被任意吃；
 * 鼠吃象、象不吃鼠；其余按等级 >= 判定。
 * @param attacker - 攻方棋子。
 * @param defender - 守方棋子。
 * @param attackerInWater - 攻方是否在河中。
 * @param defenderOnLand - 守方是否在岸上。
 * @param defenderTrapped - 守方是否站在攻方陷阱里。
 * @returns 可吃返回 true。
 */
export declare function canCapture(attacker: Piece, defender: Piece, attackerInWater: boolean, defenderOnLand: boolean, defenderTrapped: boolean): boolean;
/**
 * 生成行棋方的全部合法着法。斗兽棋没有"将军"概念，伪合法即合法：
 * 每子四正交方向走一格；仅鼠可入水；狮虎（等级 >= 6）邻水时沿直线
 * 跳到对岸第一块陆地（途中水格里任一子均为鼠且挡跳），落点按吃子
 * 规则可占则可跳；任何着法不得进入己方兽穴。
 * @param pos - 当前局面。
 * @returns 合法着法数组。
 */
export declare function legalMoves(pos: Position): Move[];
/**
 * 应用着法，返回新局面（纯函数，翻转行棋方）。
 * @param pos - 当前局面。
 * @param m - 着法。
 * @returns 走完后的新局面。
 */
export declare function applyMove(pos: Position, m: Move): Position;
/**
 * 兽穴占领方：某方棋子站在对方兽穴即该方获胜。
 * @param board - 棋盘。
 * @returns 获胜方；未分出返回 null。
 */
export declare function denWinner(board: (Piece | '')[]): Side | null;
export type Status = {
    kind: 'playing';
} | {
    kind: 'den';
    winner: Side;
} | {
    kind: 'capture-all';
    winner: Side;
} | {
    kind: 'stalemate';
    winner: Side;
};
/**
 * 对局状态判定。胜利条件（按序检查）：占领对方兽穴；全歼对方棋子；
 * 对方无合法着法（困毙判负）。
 * @param pos - 待判定局面。
 * @returns 对局状态。
 */
export declare function status(pos: Position): Status;
/**
 * 兽穴是否告急：side 兽穴的任一相邻格（均为陆地）有敌方棋子，
 * 即对方下一步可入穴获胜。
 * @param pos - 当前局面。
 * @param side - 受威胁一方。
 * @returns 告急返回 true。
 */
export declare function denInDanger(pos: Position, side: Side): boolean;
/** 局面键（63 格摆放 + 行棋方），用于确定性对比。 */
export declare function positionKey(pos: Position): string;
