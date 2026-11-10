/**
 * 汉堡师傅渲染层：柜台 + 等待顾客（随时间变急躁的表情）、订单卡片
 * （展示期画分层图 / 制作期画问号）、逐层下落堆叠动画的汉堡、时间条、
 * 心/单数/分数 HUD、底部配料按钮排与结束遮罩。基于共享主题工具，纯
 * canvas 绘制。
 */
import type { BurgerState, Ingredient } from './logic.ts';
export declare const LOGICAL_W = 720;
export declare const LOGICAL_H = 480;
/**
 * 命中测试：逻辑坐标是否点中某个配料按钮。
 * @param x - 逻辑横坐标。
 * @param y - 逻辑纵坐标。
 * @returns 命中的配料 id，未命中返回 null。
 */
export declare function ingredientAt(x: number, y: number): Ingredient | null;
/**
 * 画整帧：HUD（心/单数/分数）→ 顾客 → 订单卡 → 时间条 → 汉堡 → 按钮 →
 * 粒子 → 遮罩。观察 ordersServed/hearts 差异触发粒子；观察 stacked 变
 * 化重置下落动画时钟。
 * @param ctx - 画布上下文。
 * @param state - 游戏状态。
 * @param paused - 是否暂停（画暂停遮罩）。
 */
export declare function renderBurger(ctx: CanvasRenderingContext2D, state: BurgerState, paused: boolean): void;
