import { type Pinball2State } from './logic.ts';
/** 渲染逻辑尺寸（与 logic 的台面一致）。 */
export declare const LOGICAL_W = 420;
export declare const LOGICAL_H = 660;
/** 一帧完整绘制。
 * @param ctx - 已应用逻辑坐标变换的 2d 上下文。
 * @param view - 状态与遮罩标志（暂停遮罩由粘合层单独请求）。
 */
export declare function renderPinball2(ctx: CanvasRenderingContext2D, view: {
    state: Pinball2State;
    paused: boolean;
}): void;
