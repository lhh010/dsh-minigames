/**
 * 帆船远航渲染层：动态波纹海面、风向箭头与风旗、航线虚线与浮标
 * （下一目标金色脉冲）、船体 + 可旋转帆、航迹拖尾、速度表与帆角指示、
 * HUD（关卡 / 分数 / 剩余时间 / 浮标进度）、过关与结束遮罩。
 */
import { type SailingState } from './logic.ts';
/**
 * 渲染一帧：海面、航线与浮标、风向指示、拖尾、帆船、速度表与帆角、
 * 飘字、粒子、HUD、遮罩。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param paused - 是否显示暂停遮罩。
 */
export declare function renderSailing(ctx: CanvasRenderingContext2D, state: SailingState, paused: boolean): void;
