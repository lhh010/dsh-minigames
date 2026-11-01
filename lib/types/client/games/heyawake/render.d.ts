/**
 * 别府涂黑 canvas 渲染器：网格按房间划分 —— 房间内部 1px 细线格、房间之间
 * 2.5px 粗边界，格间无缝；玩家涂黑格深色；房间数字画在房间中心（该格被
 * 涂黑则不画）；光标环；与主白区断连的白格红框警示；过关/暂停遮罩。
 * 无状态 —— 状态由调用方持有；使用共享视觉件 (../theme.ts)。
 */
import type { HeyaPuzzle } from './logic.ts';
/** 顶部 HUD 高度（逻辑 px）。 */
export declare const HUD_H = 32;
/** 格间无缝：房间用粗边界分隔，比格间隙更清晰。 */
export declare const GAP = 0;
/** 格边长随盘面增大而缩小（6→50, 8→42, 10→36）。 */
export declare function cellSize(size: number): number;
/** 盘面边长（逻辑 px，无缝网格）。 */
export declare function boardW(size: number): number;
/** 画布逻辑宽。 */
export declare function logicalW(size: number): number;
/** 画布逻辑高：HUD + 盘面 + 底部留白。 */
export declare function logicalH(size: number): number;
/** 格 (r, c) 左上角在逻辑坐标中的位置。 */
export declare function cellOrigin(size: number, r: number, c: number): {
    x: number;
    y: number;
};
/** 逻辑坐标点命中的格，盘外返回 null。 */
export declare function cellAt(size: number, x: number, y: number): {
    r: number;
    c: number;
} | null;
/** 格中心在逻辑坐标中的位置（粒子爆发用）。 */
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
export declare function renderHeya(ctx: CanvasRenderingContext2D, puzzle: HeyaPuzzle, blacks: ReadonlySet<number>, cursor: number, paused: boolean, winText: string | null, hintCells?: readonly number[]): void;
