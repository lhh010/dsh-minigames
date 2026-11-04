/**
 * 钩荡忍者渲染层：夜晚都市剪影背景（确定性楼群 + 星点）、深渊、发光
 * 圆锚点（半径 = 吸附半径）、微下垂的钩索绳（二次贝塞尔）、忍者与拖尾、
 * 尖刺墙、终点旗、死亡碎裂粒子、距离 HUD 与各阶段遮罩。摄像机横跟
 * 玩家（向前偏移），世界元素按摄像机平移绘制。
 */
import { type GrappleState } from './logic.ts';
/**
 * 渲染一帧：背景 → 世界元素 → 忍者 → 粒子 → HUD → 遮罩。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param paused - 是否显示暂停遮罩。
 */
export declare function renderGrapple(ctx: CanvasRenderingContext2D, state: GrappleState, paused: boolean): void;
