import type { CryptarPuzzle, DigitMap, CheckResult } from './logic.ts';
export declare const LOGICAL_W = 720;
export declare const LOGICAL_H = 540;
/** 渲染所需的一帧快照。 */
export interface CryptarView {
    puzzle: CryptarPuzzle;
    mapping: DigitMap;
    /** 提示揭示的字母（金色显示）。 */
    revealed: string[];
    /** 当前选中的字母（高亮框）。 */
    selected: string | null;
    check: CheckResult;
    /** 0 起关卡下标。 */
    levelIdx: number;
    totalLevels: number;
    elapsedMs: number;
    score: number;
    hintsLeft: number;
    status: 'playing' | 'paused' | 'won';
    /** 已打满 5 关。 */
    finishedAll: boolean;
}
/** 竖式里一个字母格。 */
interface Cell {
    letter: string;
    x: number;
    y: number;
    col: number;
}
/** 一次布局的全部可命中区域。 */
export interface CryptarLayout {
    cells: Cell[];
    digits: Array<{
        digit: number;
        x: number;
        y: number;
    }>;
    hintRect: {
        x: number;
        y: number;
        w: number;
        h: number;
    };
    cellW: number;
    cellH: number;
}
/**
 * 计算某题的静态布局（字母格、数字池、提示按钮）。
 * @param puzzle - 谜题。
 */
export declare function cryptarLayout(puzzle: CryptarPuzzle): CryptarLayout;
/** 命中测试：坐标落在哪个字母格（返回该字母）。 */
export declare function letterAt(layout: CryptarLayout, x: number, y: number): string | null;
/** 命中测试：数字池里点到的数字。 */
export declare function digitAt(layout: CryptarLayout, x: number, y: number): number | null;
/** 命中测试：是否点在提示按钮上。 */
export declare function hintHit(layout: CryptarLayout, x: number, y: number): boolean;
/**
 * 整帧渲染（黑板风竖式 + 数字池 + HUD + overlay）。
 * @param ctx - 画布上下文（逻辑坐标）。
 * @param view - 当前帧快照。
 */
export declare function renderCryptar(ctx: CanvasRenderingContext2D, view: CryptarView): void;
export {};
