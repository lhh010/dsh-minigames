/**
 * 高山滑雪渲染层：暮色雪道竖向渐变与缓坡阴影线、身后双道雪痕、随横向
 * 速度倾斜的滑雪者（围巾飘带）、树木/岩石障碍、旗门双杆与缺口微光、
 * 高速时的速度线、旗门/撞击粒子与飘字、HUD（分数/距离/速度/生命）、
 * 暂停与结束遮罩。
 */
import { type SkiState } from './logic.ts';
/**
 * 渲染一帧：雪道、雪痕、地形、滑雪者、速度线、粒子、飘字、HUD、遮罩。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param paused - 是否显示暂停遮罩。
 */
export declare function renderSki(ctx: CanvasRenderingContext2D, state: SkiState, paused: boolean): void;
