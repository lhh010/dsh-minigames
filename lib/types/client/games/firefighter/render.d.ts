/**
 * 消防救火渲染：俯视街区（建筑屋顶纹理/草地/道路）、火苗橙红渐层与
 * 烟、弧线水柱粒子、焦黑废墟、戴帽持水枪的消防员（喷向随朝向），
 * 以及剩余火点/损失/冷却 HUD 与过关 overlay。纯 canvas 绘制，由逻辑
 * 状态驱动；逻辑画布固定为最大关卡盘面并居中较小盘面。
 */
import { type FirefighterState } from './logic.ts';
export declare const TILE = 46;
export declare const HUD_H = 44;
export declare const LOGICAL_W: number;
export declare const LOGICAL_H: number;
/** 逻辑坐标 (x, y) 所在格，盘面外返回 null。 */
export declare function cellAt(state: FirefighterState, x: number, y: number): {
    tx: number;
    ty: number;
} | null;
export interface FirefighterView {
    state: FirefighterState;
    paused: boolean;
}
/** 主渲染入口：背景 → 盘面 → 火 → 水柱 → 消防员 → HUD → overlay。 */
export declare function renderFirefighter(ctx: CanvasRenderingContext2D, view: FirefighterView): void;
