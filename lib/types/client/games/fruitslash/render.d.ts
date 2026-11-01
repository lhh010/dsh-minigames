/**
 * 切水果渲染层：共享主题的深色渐变背景、白到透明的渐变刀光轨迹、
 * 带高光与叶柄的圆形水果（按种类表配色）、黑体炸弹与火花、切开的
 * 两半半圆飞散、切开/爆炸的粒子迸发、HUD（分数/连击、生命 ❤、剩余时间）、
 * 暂停与结算遮罩。
 */
import type { FruitSlashState } from './logic.ts';
/**
 * 渲染一帧：背景、半块、水果、炸弹、刀光、粒子、红闪、HUD、遮罩。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param paused - 是否显示暂停遮罩。
 */
export declare function renderFruitSlash(ctx: CanvasRenderingContext2D, state: FruitSlashState, paused: boolean): void;
