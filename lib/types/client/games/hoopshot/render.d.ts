/**
 * 街头投篮渲染层：街头球场背景（地面、墙面、涂鸦感线条与球场弧线）、
 * 带支架的篮板 + 橙色筐 + 网（进球时网摆动用简单纵向缩放）、棕色篮球带
 * 纹路随自转、弹弓式瞄准拉线与预演轨迹 + 力度指示、进球金色粒子与空心
 * 球浮字「Swish!」、HUD 分数/连击/剩余时间与投数、暂停/结束遮罩。
 */
import { type HoopShotState } from './logic.ts';
/**
 * 渲染一帧：背景、篮架、瞄准、篮球、粒子、飘字、HUD、遮罩。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param paused - 是否显示暂停遮罩。
 */
export declare function renderHoopShot(ctx: CanvasRenderingContext2D, state: HoopShotState, paused: boolean): void;
