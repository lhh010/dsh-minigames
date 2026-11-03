/**
 * 电流急急棒渲染层：深色电路板背景（网格 + 焊盘走线）、发光金属轨
 * （双层描边 + 电流流动虚线动画）、中段安全岛呼吸光、终点标记、电环
 * （圆环 + 指针跟随光晕 + 环到指针的牵引线）、触电闪电链 + 红闪 +
 * 震屏、沿轨进度条、HUD（命/计时/最佳/分数）、暂停与结束遮罩。
 */
import type { SteadyHandState } from './logic.ts';
export declare function renderSteadyHand(ctx: CanvasRenderingContext2D, state: SteadyHandState, paused: boolean): void;
