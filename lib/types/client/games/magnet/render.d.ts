/**
 * 磁极迷宫渲染层：共享渐变背景、金属钢球（拖尾）、N 红 / S 蓝磁铁
 * （活动磁铁带翻转脉冲与虚线环）、磁力弧线与钢球受力箭头、尖刺球、
 * 发光终点槽、关卡 HUD 与极性按钮、过关 / 失败 / 通关 / 暂停遮罩。
 */
import { type MagnetState } from './logic.ts';
/**
 * 渲染一帧完整画面（含事件粒子爆发与拖尾维护）。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param paused - 是否暂停（暂停时叠加遮罩）。
 */
export declare function renderMagnet(ctx: CanvasRenderingContext2D, state: MagnetState, paused: boolean): void;
