import { type ChessEndState, type ChessMove } from './logic.ts';
/** 单格边长与棋盘原点（逻辑像素）。 */
export declare const CELL = 60;
export declare const BOARD: number;
export declare const BOARD_X = 40;
export declare const BOARD_Y = 116;
/** 逻辑画布尺寸。 */
export declare const W: number;
export declare const H: number;
/**
 * 绘制完整对局画面（每帧全量重绘）。
 * @param ctx - 逻辑坐标系已就位的 2d 上下文。
 * @param state - 对局状态。
 * @param selected - 选中格索引（-1 为无）。
 * @param targets - 选中棋子的合法落点。
 * @param hint - 提示走法（null 为无）。
 * @param paused - 暂停遮罩。
 */
export declare function renderChessEnd(ctx: CanvasRenderingContext2D, state: ChessEndState, selected: number, targets: readonly number[], hint: ChessMove | null, paused: boolean): void;
