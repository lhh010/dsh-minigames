/**
 * 多米诺分解 canvas 渲染器：(n+1)×(n+2) 数字盘，白底大数字格；已配对
 * 的两格之间画一条粗连接线（每对取 accent(i) 一种颜色）并给两格淡色底；
 * cursor 格描边；hoverPair 虚线预览；HUD 显示配对进度；过关/暂停遮罩。
 * 无状态 —— 全部状态由调用方持有；使用共享视觉套件（../theme.ts）。
 */
import type { DominoPuzzle } from './logic.ts';
/** 顶部 HUD 高度（逻辑像素）。 */
export declare const HUD_H = 32;
/** 格子间距。 */
export declare const GAP = 6;
/** 格子边长随阶数缩小，保证整盘可见。 */
export declare function cellSize(order: number): number;
/** 盘面行数（order + 1）。 */
export declare function rows(order: number): number;
/** 盘面列数（order + 2）。 */
export declare function cols(order: number): number;
/** 盘面像素宽度。 */
export declare function boardW(order: number): number;
/** 逻辑画布宽。 */
export declare function logicalW(order: number): number;
/** 逻辑画布高。 */
export declare function logicalH(order: number): number;
/** 格子 (r, c) 左上角的逻辑坐标。 */
export declare function cellOrigin(order: number, r: number, c: number): {
    x: number;
    y: number;
};
/** 逻辑坐标点落在哪个格子，盘外返回 null。 */
export declare function cellAt(order: number, x: number, y: number): {
    r: number;
    c: number;
} | null;
/** 格子中心的逻辑坐标（粒子爆发等）。 */
export declare function cellCenter(order: number, r: number, c: number): {
    x: number;
    y: number;
};
/**
 * 画一帧。
 * @param puzzle 当前谜题。
 * @param pairs 玩家已配对的扁平索引对。
 * @param hoverPair 悬停预览对（第一格已选中、第二格被悬停），无则 null。
 * @param cursor 键盘焦点格，无则 null。
 * @param paused 是否显示暂停遮罩。
 * @param winText 过关副标题文字，进行中为 null。
 */
export declare function renderDominosa(ctx: CanvasRenderingContext2D, puzzle: DominoPuzzle, pairs: readonly (readonly [number, number])[], hoverPair: readonly [number, number] | null, cursor: {
    r: number;
    c: number;
} | null, paused: boolean, winText: string | null): void;
