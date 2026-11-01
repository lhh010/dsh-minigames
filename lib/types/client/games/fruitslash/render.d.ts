/**
 * 切水果渲染层：共享主题的深色渐变背景、白到透明的渐变刀光轨迹、
 * 按种类表（8 种）配色的大小果、黑体炸弹与火花、切开的两半半圆飞散、
 * 切开/爆炸的粒子迸发、上浮渐隐的飘字（同种连击 / 一刀 N 切）、
 * HUD（分数/连击、生命 ❤、missed 计数、剩余时间）、暂停与结算遮罩。
 */
import type { FruitSlashState } from './logic.ts';
/**
 * 渲染一帧：背景、半块、水果、炸弹、刀光、飘字、粒子、红闪、HUD、遮罩。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param paused - 是否显示暂停遮罩。
 */
export declare function renderFruitSlash(ctx: CanvasRenderingContext2D, state: FruitSlashState, paused: boolean): void;
