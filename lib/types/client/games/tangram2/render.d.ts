import { type TangramState } from './logic.ts';
/** 渲染视图：逻辑状态 + 交互态 + 进度标记（由 index 组装）。 */
export interface TangramView {
    state: TangramState;
    selected: number | null;
    dragging: boolean;
    score: number;
    cleared: boolean;
    complete: boolean;
    paused: boolean;
}
/** 主渲染入口：桌面 -> 剪影 -> 已放块 -> 未放块 -> HUD -> overlay。 */
export declare function renderTangram(ctx: CanvasRenderingContext2D, view: TangramView): void;
/**
 * 命中测试：返回包含该点的最上层未放置板块编号（后绘制者优先）。
 * @param x - 逻辑坐标 x。
 * @param y - 逻辑坐标 y。
 * @param state - 关卡状态。
 * @returns 命中的板块编号，未命中返回 null。
 */
export declare function pieceHit(x: number, y: number, state: TangramState): number | null;
