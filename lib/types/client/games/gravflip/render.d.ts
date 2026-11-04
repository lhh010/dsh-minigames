/**
 * 重力翻转渲染层：科幻走廊（上下发光轨道 + 滚动刻度网格）、角色（翻转
 * 时 180° 旋转动画 + 残影）、尖刺三角阵、屏障墙与窗口光边、激光（预警
 * 虚线 → 发射光束）、距离 / 速度 HUD、死亡粒子与结束遮罩。
 */
import { type GravFlipState } from './logic.ts';
/**
 * 渲染一帧：走廊、障碍、角色、粒子、HUD、遮罩。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param paused - 是否显示暂停遮罩。
 */
export declare function renderGravFlip(ctx: CanvasRenderingContext2D, state: GravFlipState, paused: boolean): void;
