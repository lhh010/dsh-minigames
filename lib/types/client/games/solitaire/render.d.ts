/**
 * 纸牌接龙渲染层：绿色呢面牌桌、圆角白卡（红黑花色与点数）、牌背斜纹、
 * 发牌堆与基础堆的虚线提示框、选中牌金色高亮、HUD 区绘制分数 / 步数 /
 * 局号与撤销按钮、胜利金色粒子 + 遮罩、暂停遮罩。渲染为无状态纯绘制
 * （粒子系统为画布级单例）。
 */
import { type SolitaireState, type CardSource } from './logic.ts';
/** 撤销按钮矩形（HUD 区，供交互层命中检测）。 */
export declare const UNDO_BTN: {
    x: number;
    y: number;
    w: number;
    h: number;
};
/**
 * 渲染一帧：呢面牌桌、顶排、7 列、HUD（含撤销按钮）、胜利 / 暂停遮罩。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param selected - 当前选中的移动源（null 表示未选中）。
 * @param paused - 是否显示暂停遮罩。
 */
export declare function renderSolitaire(ctx: CanvasRenderingContext2D, state: SolitaireState, selected: CardSource | null, paused: boolean): void;
