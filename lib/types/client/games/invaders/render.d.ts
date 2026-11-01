/**
 * 小蜜蜂渲染层：星空背景（固定种子确定性生成、随时间闪烁）、三种像素
 * 造型外星人（按行区分配色）、像素炮台（受击无敌时闪烁）、玩家 / 敌方
 * 双色子弹、可蚀掩体方块、击落与受击粒子、HUD（分数 / 波次 / 生命）、
 * 波次横幅与暂停 / 结束遮罩。
 */
import type { InvadersState } from './logic.ts';
/**
 * 渲染一帧：星空、掩体、外星人编队、炮台、子弹、粒子、HUD、横幅、遮罩。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param paused - 是否显示暂停遮罩。
 */
export declare function renderInvaders(ctx: CanvasRenderingContext2D, state: InvadersState, paused: boolean): void;
