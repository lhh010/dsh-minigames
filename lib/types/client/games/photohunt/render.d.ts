/**
 * 找茬大师画布渲染：左右并排两幅程序绘制的风景（右图带修改），天空/
 * 草地打底、16 种基元按层绘制；已找到的修改在两侧同时圈绿；HUD 显示
 * 关卡、剩余数与倒计时时间条，结束/暂停时叠加共享 overlay。全部为纯
 * 绘制，不持有游戏状态（粒子系统为渲染侧观察，与 logic 无关）。
 */
import type { PhotoHuntState } from './logic.ts';
/** 顶部 HUD 高度。 */
export declare const HUD_H = 36;
/** 左图左上角横坐标。 */
export declare const LEFT_X = 16;
/** 右图左上角横坐标。 */
export declare const RIGHT_X: number;
/** 图片顶部纵坐标。 */
export declare const PANEL_Y: number;
/** 画布逻辑宽度。 */
export declare const LOGICAL_W: number;
/** 画布逻辑高度（图片 + 底部时间条区域）。 */
export declare const LOGICAL_H: number;
/**
 * 绘制一帧。
 * @param paused - 是否显示暂停 overlay。
 */
export declare function renderPhotoHunt(ctx: CanvasRenderingContext2D, state: PhotoHuntState, paused: boolean): void;
