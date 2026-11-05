import { type LightspeedState } from './logic.ts';
/** 逻辑画布尺寸（供 fitCanvas 使用）。 */
export declare const LS_RENDER_W = 960;
export declare const LS_RENDER_H = 600;
/**
 * 渲染一帧完整画面。
 * @param ctx - 已套用逻辑变换的 2d 上下文。
 * @param state - 游戏状态。
 * @param timeMs - 展示用时钟（毫秒）。
 * @param paused - 暂停中（覆盖暂停面板）。
 */
export declare function renderLightspeed(ctx: CanvasRenderingContext2D, state: LightspeedState, timeMs: number, paused: boolean): void;
