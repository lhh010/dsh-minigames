import { type AntTrailState } from './logic.ts';
/**
 * 渲染整帧。
 * @param ctx - 画布上下文。
 * @param st - 游戏状态。
 * @param paused - 是否暂停（画暂停 overlay）。
 * @param toolMode - 当前工具（障碍石 / 糖水），HUD 展示用。
 */
export declare function renderAntTrail(ctx: CanvasRenderingContext2D, st: AntTrailState, paused: boolean, toolMode: 'stone' | 'sugar'): void;
