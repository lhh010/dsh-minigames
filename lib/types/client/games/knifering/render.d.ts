/**
 * 飞刀转盘渲染层：共享主题背景、木纹转盘（同心年轮 + 中心轴帽）、
 * 钉在盘上的飞刀随盘旋转（障碍刀用暗色区分）、正上方快速下落的插刀
 * 残影线、碰刀失败时刀崩开的粒子与画布抖动、HUD（关卡/已插/命）、
 * 暂停 / 过关 / 失败遮罩。
 */
import type { KnifeRingState } from './logic.ts';
/**
 * 渲染一帧：背景、转盘、已钉飞刀、下落插刀残影、粒子、抖动、HUD、遮罩。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param paused - 是否显示暂停遮罩。
 */
export declare function renderKnifeRing(ctx: CanvasRenderingContext2D, state: KnifeRingState, paused: boolean): void;
