/**
 * 极速反应渲染层：中央大灯（等待=琥珀呼吸圆环「等待…」，信号=绿色
 * 爆闪「按！」，结果=大号毫秒数字 / 抢按红「太早了」/ 超时红「超时」）、
 * 顶部 HUD（命 / 轮次 / 平均 / 最佳 / 分数）、底部轮次进度点、暂停与
 * 结束遮罩、事件粒子。
 */
import type { ReactionState } from './logic.ts';
/**
 * 渲染一帧：背景、指示灯与阶段文案、粒子、HUD、进度点、遮罩。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param paused - 是否显示暂停遮罩。
 */
export declare function renderReaction(ctx: CanvasRenderingContext2D, state: ReactionState, paused: boolean): void;
