/**
 * 转碟杂技渲染层：舞台幕布背景（顶部垂幕 + 侧幕 + 地面）、透视长杆、
 * 旋转纹理碟子（转速慢时摇晃倾斜 + 红光预警）、掉落碟子的坠落碎裂
 * 动画、左右移动并带补转手势的杂技演员、HUD（命 / 碟数 / 分数 / 时
 * 间）、暂停与结算遮罩。渲染层自持粒子与坠落碟池，只消费逻辑层
 * events，不做任何游戏规则判断。
 */
import type { PlatesState } from './logic.ts';
/**
 * 渲染一帧：舞台、长杆、碟子、坠落碎裂、演员、粒子、HUD、遮罩。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param dtMs - 渲染帧间隔 ms（暂停时传 0，动画冻结）。
 * @param paused - 是否显示暂停遮罩。
 */
export declare function renderPlates(ctx: CanvasRenderingContext2D, state: PlatesState, dtMs: number, paused: boolean): void;
