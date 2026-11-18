import { type SheepdogState } from './logic.ts';
/**
 * 渲染整帧：背景草地 → 围栏 → 狼 → 羊 → 犬 → HUD → overlay。
 * @param ctx - 画布上下文（逻辑坐标系已由 fitCanvas 设好）。
 * @param st - 游戏状态。
 * @param paused - 是否暂停（暂停时叠加 overlay）。
 */
export declare function renderSheepdog(ctx: CanvasRenderingContext2D, st: SheepdogState, paused: boolean): void;
