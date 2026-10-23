/**
 * Mastermind 画布渲染：历史行（色钉 + 绿/黄反馈钉标记）、调色盘与操作键
 * （可点击命中检测）、当前行光标、胜负/暂停覆盖层。共享 theme 视觉件；无状态。
 */
import type { LevelConfig } from './logic.ts';
export declare const LOGICAL_W = 480;
export declare const LOGICAL_H = 620;
export declare const HUD_H = 30;
/** 渲染所需的全部游戏视图状态（index.ts 持有并传入）。 */
export interface MastermindView {
    /** 本关难度。 */
    level: LevelConfig;
    /** 关卡下标（HUD 显示）。 */
    levelIdx: number;
    /** 已提交的行：色号 + 绿/黄反馈钉数（绿=位置对，黄=颜色对位置不对）。 */
    rows: Array<{
        guess: number[];
        black: number;
        white: number;
    }>;
    /** 当前行已填的色号。 */
    current: number[];
    status: 'playing' | 'won' | 'lost';
    /** 密码（仅失败展示时使用）。 */
    secret: number[];
    streak: number;
    /** 临时提示文本（如「未填满」），空串表示无。 */
    toast: string;
    paused: boolean;
}
/**
 * 调色盘 / 操作键命中检测。
 * @returns 色号 0..5，或 'BACK' / 'ENTER'，未命中返回 null。
 */
export declare function paletteAt(x: number, y: number): number | 'BACK' | 'ENTER' | null;
/**
 * 绘制一帧。
 * @param shakeDx - 无效输入的水平抖动偏移（px）。
 */
export declare function renderMastermind(ctx: CanvasRenderingContext2D, view: MastermindView, shakeDx?: number): void;
