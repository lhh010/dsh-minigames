/**
 * 词语接龙 WordChain 渲染层：卷轴风棋盘——上方卷轴展示当前链尾词大字
 * （尾字红显 + 光晕）、卷轴内附最近历史词；AI 出词从右侧滑入；下方 5
 * 张手牌卡（可接亮边发光、不可接灰暗）；HUD 展示链长/分数/回合；结束
 * 或暂停盖共享 overlay。纯 canvas 绘制，无 DOM 状态。
 */
import { type LinkKind } from './logic.ts';
/** 逻辑画布尺寸。 */
export declare const LOGICAL_W = 680;
export declare const LOGICAL_H = 480;
/** 渲染层需要的只读视图（index 层从 MatchState 投影出来）。 */
export interface WordChainView {
    /** 当前回合（1..ROUNDS）。 */
    round: number;
    /** 链长（词数）。 */
    chainLen: number;
    /** 当前链尾词（终局后为空串）。 */
    tailWord: string;
    /** 链尾词尾字拼音（接龙提示用）。 */
    tailPy: string;
    /** 链尾之前的最近几个词（历史小字）。 */
    history: string[];
    /** 手牌词（≤5 张，出掉即短）。 */
    hand: string[];
    /** 每张手牌的尾字拼音（卡面小字）。 */
    handTailPy: string[];
    /** 每张手牌的可接性（exact/homophone/不可接 null）。 */
    playable: Array<LinkKind | null>;
    playerScore: number;
    aiScore: number;
    /** AI 最近一步的提示行（滑入动画源）。 */
    aiLine: string;
    /** aiLine 出现的时间戳（performance.now，毫秒）。 */
    aiAtMs: number;
    /** 顶部轻提示（跳过/重起等）。 */
    toast: string;
    phase: 'playing' | 'over';
    /** 用户按 P 自暂停。 */
    userPaused: boolean;
    /** 面板级暂停（未 start / 已 pause）。 */
    paused: boolean;
}
/** 手牌卡命中：返回下标，未命中返回 null。 */
export declare function cardAt(x: number, y: number): number | null;
/** 跳过按钮命中。 */
export declare function skipButtonAt(x: number, y: number): boolean;
/**
 * 整帧绘制（背景 → HUD → 卷轴 → AI 行 → 手牌 → 跳过/提示 → overlay）。
 * @param ctx - 画布上下文（逻辑坐标）。
 * @param view - 当前只读视图。
 * @param now - performance.now() 时间戳（动画用）。
 */
export declare function renderWordChain(ctx: CanvasRenderingContext2D, view: WordChainView, now: number): void;
