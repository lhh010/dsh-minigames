import type { SudokuXState } from './logic.ts';
/** 逻辑画布宽。 */
export declare const LOGICAL_W = 544;
/** 逻辑画布高。 */
export declare const LOGICAL_H = 632;
/** 顶部 HUD 高度。 */
export declare const HUD_H = 46;
/** 单元格边长。 */
export declare const CELL = 56;
/** 盘面左边距（上下留白对称）。 */
export declare const BOARD_X = 20;
/** 盘面上边距。 */
export declare const BOARD_Y = 46;
/** 底部按钮条高度。 */
export declare const FOOT_H = 46;
/** 笔记开关按钮的命中矩形。 */
export interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}
/** 笔记开关按钮矩形（index 做点击命中用）。 */
export declare const NOTE_BTN: Rect;
/** 是否落在笔记开关按钮内。 */
export declare function inNoteButton(x: number, y: number): boolean;
/** 是否落在盘面内；是则返回 { r, c }。 */
export declare function cellAt(x: number, y: number): {
    r: number;
    c: number;
} | null;
/**
 * 绘制一帧完整的对角数独画面。
 * @param ctx - 画布上下文（逻辑坐标系）。
 * @param state - 游戏状态。
 * @param cursor - 当前选中格。
 * @param noteMode - 是否处于笔记模式。
 * @param paused - 是否暂停（画暂停 overlay）。
 * @param diagHighlight - 是否高亮对角线格。
 */
export declare function renderSudokuX(ctx: CanvasRenderingContext2D, state: SudokuXState, cursor: {
    r: number;
    c: number;
}, noteMode: boolean, paused: boolean, diagHighlight: boolean): void;
