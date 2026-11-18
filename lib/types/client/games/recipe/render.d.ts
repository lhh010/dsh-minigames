/**
 * 配方厨房渲染层：左侧订单卡队列（工序图标进度 + 倒计时条 + 同煮标
 * 记）、右侧俯视厨房（双灶眼火苗动画 + 砧板）、火候条（红-暗-绿-暗-红
 * 分区 + 往复游标）、出餐飞出动画、糊烟粒子、分数/关卡/时间 HUD 与终
 * 局/暂停遮罩。基于共享主题工具，纯 canvas 绘制。
 */
import type { RecipeState } from './logic.ts';
export declare const LOGICAL_W = 720;
export declare const LOGICAL_H = 520;
/**
 * 命中测试：逻辑坐标点中哪个工位（0/1 灶眼，2 砧板）。
 * @param x - 逻辑横坐标。
 * @param y - 逻辑纵坐标。
 * @returns 工位下标，未命中返回 null。
 */
export declare function stationAt(x: number, y: number): number | null;
/**
 * 命中测试：逻辑坐标点中哪张订单卡。
 * @param x - 逻辑横坐标。
 * @param y - 逻辑纵坐标。
 * @returns 订单下标，未命中返回 null。
 */
export declare function orderCardAt(x: number, y: number): number | null;
/**
 * 画整帧：背景 → HUD → 订单卡 → 厨房 → 火候条 → 粒子/烟/飞出 → 遮罩。
 * 观察 servedTotal/burnCount 差异触发飞出与糊烟。
 * @param ctx - 画布上下文。
 * @param state - 游戏状态。
 * @param paused - 是否暂停（画暂停遮罩）。
 */
export declare function renderRecipe(ctx: CanvasRenderingContext2D, state: RecipeState, paused: boolean): void;
