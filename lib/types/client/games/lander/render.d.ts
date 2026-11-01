/**
 * 月球着陆渲染层：星空背景（确定性星点）、灰色折线山脊与发光 pad
 * （绿色 = 低倍率，金色 = 高倍率）、三角登月舱（喷口火焰随点火闪烁）、
 * 速度 / 燃料 / 高度 HUD、飘字与成功 / 坠毁 / 结束遮罩。
 */
import { type LanderState } from './logic.ts';
/**
 * 渲染一帧：星空、山脊与 pad、登月舱、飘字、粒子、HUD、遮罩。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param paused - 是否显示暂停遮罩。
 */
export declare function renderLander(ctx: CanvasRenderingContext2D, state: LanderState, paused: boolean): void;
