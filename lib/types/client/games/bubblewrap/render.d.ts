/**
 * 泡泡纸渲染层：共享主题的深色渐变背景、按板号轮换 accent 配色的
 * 泡泡板——未爆为凸起高光圆（左上高光 + 底部暗边），已爆为瘪掉的
 * 凹陷圆（暗色 + 内阴影描边）；捏爆瞬间粒子飞溅与 x{combo} 飘字、
 * 换板提示飘字；HUD 显示分数 / 板号 / combo（含历史最高）；暂停遮罩
 * （本游戏无失败，只有暂停）。渲染为无状态纯绘制。
 */
import { type BubbleWrapState } from './logic.ts';
/**
 * 渲染一帧：背景、泡泡板、事件粒子、飘字、HUD、暂停遮罩。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param paused - 是否显示暂停遮罩。
 */
export declare function renderBubbleWrap(ctx: CanvasRenderingContext2D, state: BubbleWrapState, paused: boolean): void;
