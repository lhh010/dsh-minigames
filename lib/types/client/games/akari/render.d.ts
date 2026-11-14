/**
 * 点灯 (Akari) canvas 渲染器：暖纸色盘面，墙格深色、数字墙大数字，
 * 灯泡发光 (glow) 且其照亮范围铺淡黄覆盖；互相看见的灯红圈警示；
 * 仍未照亮的白格铺微暗色提示；顶部 HUD（关卡 / 灯数 / 未照亮数）；
 * 过关与暂停遮罩。无状态 —— 状态由调用方持有；使用共享视觉件
 * (../theme.ts)。
 */
import type { AkariBoard } from './logic.ts';
/** 顶部 HUD 高度（逻辑 px）。 */
export declare const HUD_H = 32;
/** 格边长随盘面增大而缩小（7→48, 8→44, 9-10→38）。 */
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
 * @param board - 当前盘面。
 * @param lights - 玩家灯位集合。
 * @param level - 1 基关卡号（HUD 显示）。
 * @param paused - 显示暂停遮罩。
 * @param winText - 过关遮罩副标题，游玩中为 null。
 * @param hintCell - 提示格下标（未照亮格），-1 隐藏。
 */
export declare function renderAkari(ctx: CanvasRenderingContext2D, board: AkariBoard, lights: ReadonlySet<number>, level: number, paused: boolean, winText: string | null, hintCell?: number): void;
