/**
 * 蹦蹦跳渲染层：竖直卷轴（摄像机跟随）、随高度加深的渐变天空与
 * 渐现星点、四色平台（蓝普通 / 青移动 / 金易碎 / 红尖刺）、小家伙
 * 挤压拉伸弹跳动画、碎裂与弹跳粒子、高度 HUD、暂停 / 结束遮罩。
 */
import { type JumperState } from './logic.ts';
/**
 * 渲染一帧：天空、星点、视野内平台（碎裂板跳过）、小家伙、粒子、
 * HUD、暂停 / 结束遮罩。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param paused - 是否显示暂停遮罩。
 */
export declare function renderJumper(ctx: CanvasRenderingContext2D, state: JumperState, paused: boolean): void;
