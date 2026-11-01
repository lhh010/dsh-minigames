/**
 * 丢纸团渲染层：办公室简约背景（墙裙、窗户、地板、盆栽）、立于地板的
 * 纸篓（口沿发光）、旋转的皱纸团、弹弓式瞄准虚线（含按当前风力预演的
 * 点状轨迹）、风力 HUD（箭头长度 = 强度、方向 = 风向）、命中溅射粒子与
 * 飘字、脱手/结束遮罩。
 */
import { type PaperTossState } from './logic.ts';
/**
 * 渲染一帧：背景、纸篓、瞄准、纸团、粒子、飘字、HUD、遮罩。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param paused - 是否显示暂停遮罩。
 */
export declare function renderPaperToss(ctx: CanvasRenderingContext2D, state: PaperTossState, paused: boolean): void;
