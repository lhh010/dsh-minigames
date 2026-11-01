/**
 * 太极 canvas 渲染器：黑白圆点 tile（黑子深底、白子亮底），白圈预置格
 * 加白环标记，冲突行列/相邻同色格红描边，金色提示环，HUD 与过关/暂停
 * 遮罩。无状态 —— 状态由调用方持有；使用共享视觉件 (../theme.ts)。
 */
import { type CellValue, type TaijiPuzzle } from './logic.ts';
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
 * @param grid - 玩家盘面（0 空 / 1 黑 / 2 白，给定格已置锁定值）。
 * @param paused - 显示暂停遮罩。
 * @param winText - 过关遮罩副标题，游玩中为 null。
 * @param hintCell - 提示格下标（金色描边），-1 为无提示。
 */
export declare function renderTaiji(ctx: CanvasRenderingContext2D, puzzle: TaijiPuzzle, grid: readonly CellValue[], paused: boolean, winText: string | null, hintCell?: number): void;
