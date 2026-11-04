/**
 * 手忙脚乱 QWOP 渲染层：侧面跑道选手（躯干/大腿/小腿线段关节）、每
 * 10 米标尺与 50 米终点旗、QWOP 四键提示（按下高亮 + 各自驱动哪个关
 * 节）、距离/最佳 HUD 与 0→50 m 进度条、踏步尘土与摔倒粒子、暂停/
 * 摔倒/过线遮罩。纯绘制，无状态（粒子系统实例除外）。
 */
import { type QwopState, type QwopInput } from './logic.ts';
/**
 * 渲染一帧：背景、跑道、选手、事件粒子、HUD、按键提示、遮罩。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param input - 当前输入（按键高亮）。
 * @param paused - 是否显示暂停遮罩。
 * @param best - 本次会话最佳距离（米）。
 */
export declare function renderQwop(ctx: CanvasRenderingContext2D, state: QwopState, input: QwopInput, paused: boolean, best: number): void;
