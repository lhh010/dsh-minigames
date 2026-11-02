/**
 * 数块 canvas 渲染器：连续格子盘（无格缝），区域按 accent 轮换淡色
 * 底，区域之间画粗边界线；数字格（给定格加粗提亮）、光标描边、冲突
 * 红字、提示格金色闪显应填值、HUD（关卡/已填/规则/多解徽章）与过关/
 * 暂停遮罩。无状态 —— 状态由调用方持有；使用共享视觉件 (../theme.ts)。
 */
import type { SuguruPuzzle } from './logic.ts';
export declare const HUD_H = 32;
export declare const PAD = 12;
/** 格边长随盘面增大而缩小。 */
export declare function cellSize(size: number): number;
export declare function boardW(size: number): number;
export declare function logicalW(size: number): number;
export declare function logicalH(size: number): number;
/** 格 (r, c) 左上角在逻辑坐标中的位置。 */
export declare function cellOrigin(size: number, r: number, c: number): {
    x: number;
    y: number;
};
/** 逻辑坐标点命中的格，格外返回 null。 */
export declare function cellAt(size: number, x: number, y: number): {
    r: number;
    c: number;
} | null;
/** 格中心（粒子爆发用）。 */
export declare function cellCenter(size: number, r: number, c: number): {
    x: number;
    y: number;
};
/**
 * 绘制一帧。
 * @param ctx - 画布上下文。
 * @param puzzle - 当前关卡。
 * @param grid - 玩家填数（0 为空，给定格已置锁定值）。
 * @param level - 展示关卡号（1 基）。
 * @param cursor - 光标格下标，-1 隐藏。
 * @param paused - 显示暂停遮罩。
 * @param winText - 过关遮罩副标题，游玩中为 null。
 * @param hintCell - 提示格下标（金色描边 + 闪显应填值），-1 为无。
 */
export declare function renderSuguru(ctx: CanvasRenderingContext2D, puzzle: SuguruPuzzle, grid: readonly number[], level: number, cursor: number, paused: boolean, winText: string | null, hintCell?: number): void;
