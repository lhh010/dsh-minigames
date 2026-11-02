/**
 * 电流急急棒渲染层：深色电路板背景（网格 + 焊盘走线）、发光金属轨
 * （双层描边 + 电流流动虚线动画）、中段安全岛呼吸光、终点标记、电环
 * （圆环 + 指针跟随光晕 + 环到指针的牵引线）、触电闪电链 + 红闪 +
 * 震屏、沿轨进度条、HUD（命/计时/最佳/分数）、暂停与结束遮罩。
 */
import type { SteadyHandState } from './logic.ts';
/**
 * 渲染一帧：背景、轨道、安全岛、终点、电环、闪电、粒子、红闪、震屏、
 * 进度条、HUD、遮罩。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param paused - 是否显示暂停遮罩。
 */
export declare function renderSteadyHand(ctx: CanvasRenderingContext2D, state: SteadyHandState, paused: boolean): void;
