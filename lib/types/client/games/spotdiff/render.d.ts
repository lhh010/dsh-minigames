/**
 * 找不同画布渲染：同一画布左右分割为两幅图案面板，形状按种类绘制
 * （圆/方/三角/星），已找到的差异在两侧同时圈红；HUD 显示关卡、剩余差异
 * 与点错数，底部为时间条，结束/暂停时叠加共享 overlay。全部为纯绘制，
 * 不持有任何游戏状态（粒子系统除外，与 logic 无关）。
 */
import type { SpotDiffState } from './logic.ts';
/** 顶部 HUD 高度。 */
export declare const HUD_H = 36;
/** 左面板左上角横坐标。 */
export declare const LEFT_X = 16;
/** 右面板左上角横坐标。 */
export declare const RIGHT_X: number;
/** 面板顶部纵坐标。 */
export declare const PANEL_Y: number;
/** 画布逻辑宽度。 */
export declare const LOGICAL_W: number;
/** 画布逻辑高度（面板 + 底部时间条区域）。 */
export declare const LOGICAL_H: number;
/**
 * 绘制一帧。
 * @param paused - 是否显示暂停 overlay。
 */
export declare function renderSpotDiff(ctx: CanvasRenderingContext2D, state: SpotDiffState, paused: boolean): void;
