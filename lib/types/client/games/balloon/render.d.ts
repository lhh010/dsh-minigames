/**
 * 吹气球渲染层：居中大气球随充气量渐大（椭圆体 + 表面高光 + 底部
 * 结节与摆动气线），充气量逼近阈值时抖动预警；顶部 HUD（分数 / 第
 * n 只 / 潜在分）、底部 10 个存入进度点、存入金粒与爆裂红粒、暂停与
 * 结束遮罩。
 */
import type { BalloonState } from './logic.ts';
/**
 * 渲染一帧：背景、气球、粒子、HUD、进度点、遮罩与待机提示。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param paused - 是否显示暂停遮罩。
 */
export declare function renderBalloon(ctx: CanvasRenderingContext2D, state: BalloonState, paused: boolean): void;
