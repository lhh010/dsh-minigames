/**
 * 旋转迷宫渲染层：圆形木盘（径向渐变 + 环向刻痕纹理）、随盘角旋转的
 * 环墙 / 辐墙（弧与径向线精确绘制）、尖刺陷阱、终点孔（发光脉冲）、
 * 金属小球（高光 + 运动拖尾）、盘角指示标记与屏幕系重力箭头、关卡 /
 * 时间 / 分数 HUD、暂停 / 过关 / 失败遮罩与过关粒子。渲染为无状态纯
 * 绘制（拖尾与粒子由 index 层持有）。
 */
import { type TiltMazeState, type Vec } from './logic.ts';
/** 渲染选项。 */
export interface TiltMazeRenderOpts {
    /** 是否暂停遮罩。 */
    paused: boolean;
    /** 当前时间 ms（终点孔脉冲相位）。 */
    nowMs: number;
    /** 帧间隔 ms（粒子推进）。 */
    dtMs: number;
    /** 小球拖尾（屏幕系相对盘心坐标，旧在前）。 */
    trail: Vec[];
}
/**
 * 过关粒子爆发（在小球当前屏幕位置）。
 * @param x - 画布 x px。
 * @param y - 画布 y px。
 */
export declare function burstWin(x: number, y: number): void;
/**
 * 主渲染入口：背景、木盘、墙、陷阱、终点孔、盘角标记、拖尾、小球、
 * 重力箭头、HUD、粒子与遮罩。
 * @param ctx - 画布上下文（已施加逻辑坐标变换）。
 * @param state - 当前状态。
 * @param opts - 渲染选项（暂停、时间、拖尾）。
 */
export declare function renderTiltMaze(ctx: CanvasRenderingContext2D, state: TiltMazeState, opts: TiltMazeRenderOpts): void;
