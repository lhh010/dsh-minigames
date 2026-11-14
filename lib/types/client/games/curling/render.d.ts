/**
 * 冰壶渲染层：微噪点冰面、红蓝同心营垒圈、带手柄的旋转壶身、方向
 * 摆针 + 力度条 + 擦冰余量 UI、局分/总分计分板、局间与胜负遮罩。
 * 只做绘制，不改状态；全部绘制在固定逻辑坐标系（LOGICAL_W x
 * LOGICAL_H）内完成，赛道世界坐标 1:1 映射进冰面矩形。
 */
import { type CurlingState } from './logic.ts';
export declare const LOGICAL_W = 680;
export declare const LOGICAL_H = 380;
export interface CurlingView {
    state: CurlingState;
    paused: boolean;
}
/** 世界坐标 → 逻辑画布坐标。 */
export declare function worldToLogical(x: number, y: number): {
    x: number;
    y: number;
};
/** 逻辑画布坐标 → 世界坐标。 */
export declare function logicalToWorld(x: number, y: number): {
    x: number;
    y: number;
};
/** 渲染冰壶一帧（纯绘制）。 */
export declare function renderCurling(ctx: CanvasRenderingContext2D, view: CurlingView): void;
