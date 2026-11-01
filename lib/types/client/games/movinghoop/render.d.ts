/**
 * 移动篮筐渲染层：黄昏球场背景（暖色天际、剪影楼层、地面）、带支架的
 * 篮板 + 橙色筐 + 网（跟随筐口运动，进球时网纵向拉伸回弹）、棕色篮球带
 * 纹路随自转、弹弓式瞄准拉线与预演轨迹 + 力度指示、篮筐运动时画淡色轨
 * 迹槽提示运动范围、进球金色粒子与空心球浮字「Swish!」、HUD 分数/连击/
 * 剩余时间与投数、暂停/结束遮罩。
 */
import { type MovingHoopState } from './logic.ts';
/**
 * 渲染一帧：背景、运动轨迹槽、篮架、瞄准、篮球、粒子、飘字、HUD、遮罩。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param paused - 是否显示暂停遮罩。
 */
export declare function renderMovingHoop(ctx: CanvasRenderingContext2D, state: MovingHoopState, paused: boolean): void;
