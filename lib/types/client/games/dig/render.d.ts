/**
 * 地底挖矿渲染层：按深度分层的泥土、铆钉硬石、闪烁宝石、出口指示灯、
 * 落石（静止 / 抖动预警 / 坠落）、矿工帽灯玩家、地道怪物、宝石/生命/深度
 * HUD 与过关/失败/暂停遮罩。全部为纯 canvas 绘制，特效仅为对逻辑状态的
 * 观察（粒子、上一帧分数）。
 */
import type { DigState } from './logic.ts';
export declare const HUD_H = 30;
export declare const LOGICAL_W: number;
export declare const LOGICAL_H: number;
/**
 * 绘制一帧。
 * @param ctx - 画布上下文。
 * @param state - 游戏状态。
 * @param t - 累计秒数（闪烁动画时钟）。
 * @param paused - 是否显示暂停遮罩。
 */
export declare function renderDig(ctx: CanvasRenderingContext2D, state: DigState, t: number, paused: boolean): void;
