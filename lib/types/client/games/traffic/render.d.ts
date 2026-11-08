/**
 * 交叉路口 canvas 渲染：柏油路面与车道线、四向信号灯（红黄绿发光）、
 * 车辆（seed 配色 + 刹车灯）、排队长度警示、通过数/时间/拥堵 HUD、
 * 结束遮罩。渲染器无状态，每帧从纯逻辑状态直接绘制。
 */
import type { TrafficState } from './logic.ts';
export declare const LOGICAL_W = 520;
export declare const HUD_H = 34;
export declare const LOGICAL_H: number;
/**
 * 绘制一帧完整画面。
 * @param ctx - 画布上下文。
 * @param state - 当前对局状态。
 * @param paused - 是否显示暂停遮罩。
 */
export declare function renderTraffic(ctx: CanvasRenderingContext2D, state: TrafficState, paused: boolean): void;
