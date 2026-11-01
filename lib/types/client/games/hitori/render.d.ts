/**
 * 记独 canvas 渲染器：n×n 数字盘、玩家涂黑格、光标环、重复白格红色数字、
 * 与主白区断连的孤立白格红框警示
 * 提示与过关/暂停遮罩。无状态 —— 状态由调用方持有；使用共享视觉件
 * (../theme.ts)。
 */
import type { HitoriPuzzle } from './logic.ts';
export declare const HUD_H = 32;
export declare const GAP = 6;
/** 格边长随盘面增大而缩小，保证整盘落在画布内。 */
export declare function cellSize(size: number): number;
export declare function boardW(size: number): number;
export declare function logicalW(size: number): number;
export declare function logicalH(size: number): number;
/** 格 (r, c) 左上角在逻辑坐标中的位置。 */
export declare function cellOrigin(size: number, r: number, c: number): {
    x: number;
    y: number;
};
/** 逻辑坐标点命中的格，格 外返回 null。 */
export declare function cellAt(size: number, x: number, y: number): {
    r: number;
    c: number;
} | null;
/** 格 中心在逻辑坐标中的位置（粒子爆发用）。 */
export declare function cellCenter(size: number, r: number, c: number): {
    x: number;
    y: number;
};
/**
 * 绘制一帧。
 * @param ctx - 画布上下文。
 * @param puzzle - 当前关卡盘面。
 * @param blacks - 玩家已涂黑格集合。
 * @param cursor - 光标格下标，-1 隐藏光标环。
 * @param paused - 显示暂停遮罩。
 * @param winText - 过关遮罩副标题，游玩中为 null。
 * @param hintCells - 提示覆盖：应涂黑格的金色描边，空数组为无提示。
 */
export declare function renderHitori(ctx: CanvasRenderingContext2D, puzzle: HitoriPuzzle, blacks: ReadonlySet<number>, cursor: number, paused: boolean, winText: string | null, hintCells?: readonly number[]): void;
