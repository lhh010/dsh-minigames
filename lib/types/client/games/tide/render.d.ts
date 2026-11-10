/**
 * 潮汐赶海渲染层：顶部海面渐变 + 水线推进（正弦波纹动画随 t 滚动）、
 * 滩涂网格与深度带着色、发光珍珠 / 海星 / 贝壳、水桶玩家、潮汐进度条
 * （退潮青 / 平潮绿 / 涨潮金→红预警，含 24s / 40s 刻度）、命 / 轮 / 分
 * HUD、拾取与被卷走粒子、暂停与结束遮罩。无状态：只读逻辑态。
 */
import { type TideState } from './logic.ts';
/**
 * 渲染一帧：背景、滩涂、海水、物品、玩家、时间轴、粒子、HUD、遮罩。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param paused - 是否显示暂停遮罩。
 */
export declare function renderTide(ctx: CanvasRenderingContext2D, state: TideState, paused: boolean): void;
