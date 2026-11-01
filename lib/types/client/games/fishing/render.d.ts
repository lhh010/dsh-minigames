/**
 * 悠闲钓鱼渲染层：天空 / 水面分界线（上天空下水下渐深）、确定性游动的
 * 水下鱼影、咬钩波纹与浮标、钓线与搏斗中的鱼影（深度随收线距离）、
 * 右侧张力条（绿→黄→红渐变）与收线进度条、HUD 分数 / 断线次数 /
 * 剩余时间、捕获结算浮字、粒子、暂停与结束遮罩。无状态：只读逻辑态。
 */
import { type FishingState } from './logic.ts';
/**
 * 渲染一帧：天空水体、鱼影、浮标与钓线、仪表、浮字、粒子、HUD、遮罩。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param paused - 是否显示暂停遮罩。
 */
export declare function renderFishing(ctx: CanvasRenderingContext2D, state: FishingState, paused: boolean): void;
