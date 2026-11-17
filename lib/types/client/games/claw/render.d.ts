/**
 * 抓娃娃机 Claw 渲染层：玻璃柜（反光渐变 + 高光）、按纵深缩小的毛绒
 * 娃娃、导轨与台车、缆绳钟摆摆动、三指开合爪、夹中提升 / 滑落 / 入洞
 * 粒子、币数 / 分数 / 轮次 HUD、暂停与结束遮罩。无状态：只读逻辑态，
 * 事件转粒子爆发（logic 每帧开头清空事件）。
 */
import { type ClawState } from './logic.ts';
/**
 * 整帧渲染：背景 → 机柜 → 娃娃（后排在先）→ 导轨与爪 → 事件粒子 →
 * HUD → 提示 / 遮罩。
 * @param ctx - 画布上下文。
 * @param state - 当前逻辑态。
 * @param paused - 是否暂停（暂停时粒子冻结、盖遮罩）。
 */
export declare function renderClaw(ctx: CanvasRenderingContext2D, state: ClawState, paused: boolean): void;
