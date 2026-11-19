/**
 * 阴阳双色 (YinYang) canvas 渲染器：水墨风盘面——黑格墨块、白格留白带
 * 边框；预标格金色描边；同色 2×2 违例红框整块框出；双色已填区域各自
 * 连通时盘面外沿发光（连通指示）；顶部 HUD（关卡 / 步数 / 空格）；
 * 过关时太极图案显现 + 遮罩；暂停遮罩。无状态——状态由调用方持有；
 * 使用共享视觉件 (../theme.ts)。
 */
import type { YinYangBoard } from './logic.ts';
/** 顶部 HUD 高度（逻辑 px）。 */
export declare const HUD_H = 32;
/** 格边长随盘面增大而缩小（6→52, 7→46, 8→42, 9-10→38）。 */
export declare function cellSize(size: number): number;
/** 盘面边长（逻辑 px）。 */
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
 * @param board - 当前盘面（线索 + 生成解）。
 * @param grid - 玩家盘（线索 + 已填格）。
 * @param level - 1 基关卡号（HUD 显示）。
 * @param steps - 玩家步数（HUD 显示）。
 * @param paused - 显示暂停遮罩。
 * @param winText - 过关遮罩副标题，游玩中为 null。
 * @param hintCell - 提示格下标，-1 隐藏。
 */
export declare function renderYinYang(ctx: CanvasRenderingContext2D, board: YinYangBoard, grid: Int8Array, level: number, steps: number, paused: boolean, winText: string | null, hintCell?: number): void;
