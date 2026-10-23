/**
 * Wordle 画布渲染：按关卡词长/次数自适应的猜测格子、屏幕 QWERTY 键盘
 * （可点击命中检测）、HUD（关卡 / 连胜 / 行）、无效猜测提示与胜负覆盖层。
 * 共享 theme 视觉件；无状态。
 */
import type { KeyHints, LetterVerdict } from './logic.ts';
export declare const LOGICAL_W = 480;
export declare const LOGICAL_H = 620;
export declare const HUD_H = 30;
/**
 * 屏幕键盘命中检测。
 * @returns 按键名（字母 / 'ENTER' / 'BACK'），未命中返回 null。
 */
export declare function keyAt(x: number, y: number): string | null;
/** 渲染所需的全部游戏视图状态（index.ts 持有并传入）。 */
export interface WordleView {
    /** 已提交的行：猜测词 + 判定。 */
    rows: Array<{
        guess: string;
        verdicts: LetterVerdict[];
    }>;
    /** 当前行已输入的字母（最多 len 个）。 */
    current: string;
    keyHints: KeyHints;
    status: 'playing' | 'won' | 'lost';
    answer: string;
    /** 本关词长（4 / 5 / 6），决定格子列数。 */
    len: number;
    /** 本关机会数（6 或 7），决定格子行数。 */
    tries: number;
    level: number;
    streak: number;
    /** 临时提示文本（如「不足 N 个字母」），空串表示无。 */
    toast: string;
    paused: boolean;
}
/**
 * 绘制一帧。
 * @param shakeDx - 无效猜测的水平抖动偏移（px）。
 */
export declare function renderWordle(ctx: CanvasRenderingContext2D, view: WordleView, shakeDx?: number): void;
