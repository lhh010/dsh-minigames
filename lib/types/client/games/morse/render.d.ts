/**
 * 摩斯电码画布渲染：电台面板（指示灯 + 按键时长波形条）、目标词槽位、
 * 候选字母网格、可开关的对照表侧栏、关卡/生命/得分 HUD 与结束遮罩。
 * 全部为无状态绘制：亮灯、按压时长、闪烁反馈由调用方（index.ts）传入。
 */
import type { MorseState } from './logic.ts';
/** 逻辑画布尺寸。 */
export declare const LOGICAL_W = 680;
export declare const LOGICAL_H = 500;
/** 渲染所需的运行时输入（由 index.ts 持有）。 */
export interface MorseRenderOpts {
    paused: boolean;
    hintVisible: boolean;
    /** 电台指示灯是否点亮（播放信号或正在按键）。 */
    lampOn: boolean;
    /** 当前按压持续毫秒数（未按键为 null），驱动波形条。 */
    pressMs: number | null;
    /** 答题反馈闪烁：'none' 无，'good' 绿，'bad' 红。 */
    flash: 'none' | 'good' | 'bad';
}
/** 电台面板区域（点击 = 解码重播 / 编码按下电键）。 */
export declare function radioAt(x: number, y: number): boolean;
/**
 * 命中候选字母网格。
 * @param x - 逻辑坐标 x。
 * @param y - 逻辑坐标 y。
 * @param alphabet - 本关字符集（决定网格内容）。
 * @returns 命中的字符，格外来 null。
 */
export declare function letterAt(x: number, y: number, alphabet: string): string | null;
/**
 * 绘制一帧。
 * @param ctx - 画布上下文（逻辑坐标已由 fitCanvas 变换）。
 * @param state - 游戏状态。
 * @param opts - 运行时渲染输入。
 */
export declare function renderMorse(ctx: CanvasRenderingContext2D, state: MorseState, opts: MorseRenderOpts): void;
