/**
 * 大家来找茬画布渲染：同一画布左右并排两张"照片"面板，程序化几何元素
 * 按 hsl 颜色绘制（圆/方/三角/线/纹理块，带随机角度），已找到的差异在
 * 两侧同时圈红；HUD 显示关卡、剩余差异与点错数，底部为限时条，结束/
 * 暂停时叠加共享 overlay。全部为纯绘制，不持有任何游戏状态（粒子系统
 * 除外，与 logic 无关）。
 */
import type { SpotPhotoState } from './logic.ts';
/** 顶部 HUD 高度。 */
export declare const HUD_H = 36;
/** 左照片左上角横坐标。 */
export declare const LEFT_X = 16;
/** 右照片左上角横坐标。 */
export declare const RIGHT_X: number;
/** 面板顶部纵坐标。 */
export declare const PANEL_Y: number;
/** 画布逻辑宽度。 */
export declare const LOGICAL_W: number;
/** 画布逻辑高度（照片 + 底部限时条区域）。 */
export declare const LOGICAL_H: number;
/**
 * 绘制一帧。
 * @param paused - 是否显示暂停 overlay。
 */
export declare function renderSpotPhoto(ctx: CanvasRenderingContext2D, state: SpotPhotoState, paused: boolean): void;
