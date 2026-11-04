/**
 * 洞穴飞行渲染层：岩洞质感的上下壁（折线填充 + 段内确定性锯齿钟乳石
 * + 边缘高光）、直升机（旋翼旋转动画、机身随垂直速度俯仰、尾桨）、
 * 随深入渐暗的光照（机体周围径向灯光渐变）、坠毁爆炸粒子、距离 /
 * 最佳 HUD 与结束 / 暂停遮罩。
 */
import { type CopterState } from './logic.ts';
/**
 * 渲染一帧：背景、岩洞、光照、直升机、粒子、HUD、遮罩。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param paused - 是否显示暂停遮罩。
 * @param best - 本会话最佳距离 m（结束遮罩展示用）。
 */
export declare function renderCopter(ctx: CanvasRenderingContext2D, state: CopterState, paused: boolean, best: number): void;
