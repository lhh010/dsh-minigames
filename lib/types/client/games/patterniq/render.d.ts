/**
 * 找规律 PatternIQ 渲染：题卡（数字序列大字 / 图形序列程序绘制）、
 * 4 选项卡（点击热区与绘制同一几何）、题卡右上倒计时环、反馈阶段
 * 规律解释条滑出、节末小结 + 错题回顾、题号/分数 HUD 与底部常驻速览。
 * 逻辑坐标 640×420，全部矩形两两不相交（见各常量注释）。
 */
import { type ParticleSystem } from '../theme.ts';
import { type PatterniqState, type WrongEntry } from './logic.ts';
/** 逻辑画布宽。 */
export declare const LOGICAL_W = 640;
/** 逻辑画布高。 */
export declare const LOGICAL_H = 420;
/** 题卡：(40,44) 起 560×118，水平居中（(640-560)/2=40）。 */
export declare const CARD_X = 40;
export declare const CARD_Y = 44;
export declare const CARD_W = 560;
export declare const CARD_H = 118;
/** 解释条：(80,178) 起 480×64，位于题卡(162)与选项(262)之间。 */
export declare const EXPLAIN_X = 80;
export declare const EXPLAIN_Y = 178;
export declare const EXPLAIN_W = 480;
export declare const EXPLAIN_H = 64;
/** 4 选项卡：起点 (28,262)，每卡 134×56、间距 16，行宽 584 居中。 */
export declare const OPT_Y = 262;
export declare const OPT_W = 134;
export declare const OPT_H = 56;
export declare const OPT_GAP = 16;
export declare const OPT_START_X = 28;
/** 选项卡 i 的左上角 x。 */
export declare function optionX(i: number): number;
/**
 * 点击热区命中检测（与绘制同一几何）。
 * @param x - 逻辑坐标 x。
 * @param y - 逻辑坐标 y。
 * @returns 选项下标 0-3，未命中为 null。
 */
export declare function optionCardAt(x: number, y: number): number | null;
/** 错题回顾一行文案：「3, 7, 11, 15 → 19（等差数列，公差 4；你答 20）」。 */
export declare function wrongEntryText(entry: WrongEntry): string;
/**
 * 渲染整局画面（含暂停遮罩，dtMs 驱动解释条滑出动画）。
 * @param ctx - 画布上下文（逻辑坐标已由 fitCanvas 变换）。
 * @param state - 局面。
 * @param particles - 粒子系统（答对爆发后在此 tick）。
 * @param paused - 是否暂停（叠加遮罩）。
 * @param dtMs - 距上一帧毫秒数。
 */
export declare function renderPatterniq(ctx: CanvasRenderingContext2D, state: PatterniqState, particles: ParticleSystem, paused: boolean, dtMs: number): void;
