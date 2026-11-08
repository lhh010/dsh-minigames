/**
 * 节奏打击渲染层：4 条竖直轨道 + 底部判定线，音符按剩余时间下落
 * （轨道色发光条）；判定产生打击波纹与 PERFECT 金 / GOOD 蓝 / MISS
 * 红文字弹出；中央连击计数带放大动画，顶部 HUD（心形生命 / 倍率 /
 * 分数），底部 D F J K 按键提示；暂停与结束遮罩、事件粒子。
 */
import type { RhythmState } from './logic.ts';
/**
 * 渲染一帧：背景、轨道与判定线、下落音符、特效、HUD、遮罩。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param paused - 是否显示暂停遮罩。
 */
export declare function renderRhythm(ctx: CanvasRenderingContext2D, state: RhythmState, paused: boolean): void;
