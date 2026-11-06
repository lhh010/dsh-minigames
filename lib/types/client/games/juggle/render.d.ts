/**
 * 杂技抛球渲染层：共享主题舞台背景（渐变夜幕 + 顶灯光斑）、底部跟随
 * 指针的双手托盘、渐变彩球 + 运动拖尾、拍击波纹与粒子迸发、飘字、
 * HUD（分数 / 生命 / 球数 / 连击倍率）、暂停与结算遮罩。渲染层自持
 * 粒子与波纹池，只消费逻辑层 events，不做任何游戏规则判断。
 */
import type { JuggleState } from './logic.ts';
/**
 * 渲染一帧：舞台、托盘、球、飘字、波纹、粒子、HUD、遮罩。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param trayX - 托盘中心逻辑 x（跟随指针）。
 * @param paused - 是否显示暂停遮罩。
 */
export declare function renderJuggle(ctx: CanvasRenderingContext2D, state: JuggleState, trayX: number, paused: boolean): void;
