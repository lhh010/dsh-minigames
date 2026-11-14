import { type RingTossState } from './logic.ts';
/**
 * 渲染一帧完整场景。
 * @param ctx - 画布上下文。
 * @param state - 游戏状态。
 * @param paused - 暂停遮罩开关。
 */
export declare function renderRingToss(ctx: CanvasRenderingContext2D, state: RingTossState, paused: boolean): void;
