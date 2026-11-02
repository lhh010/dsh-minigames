/**
 * 麻将连连看渲染层：竹骨质感牌面（象牙底、侧面厚度带）、几何绘制的筒/条/万
 * 符号、选中高亮与提示对闪烁、消除路径折线动画（含场外虚拟圈坐标）、死局
 * 自动洗牌的抖动动画，以及 HUD（关 / 剩余对 / 时间）。动画状态集中在
 * {@link MahjongView}，逻辑层保持纯函数。
 */
import type { MahjongState, Pos } from './logic.ts';
/** 逻辑像素常量：牌格边长、HUD 高、四周留给场外折线的边距。 */
export declare const CELL = 44;
export declare const HUD_H = 34;
export declare const PAD = 26;
export declare const BOARD_W: number;
export declare const BOARD_H: number;
export declare const LOGICAL_W: number;
export declare const LOGICAL_H: number;
/** 网格坐标（允许 -1 / rows / cols 场外虚拟圈）转画布中心点。 */
export declare function cellCenter(p: Pos): {
    x: number;
    y: number;
};
/** 一次消除的折线动画（path 为逻辑层返回的拐点序列，含两端点）。 */
export interface ClearFx {
    path: Pos[];
    startMs: number;
}
/**
 * 渲染侧动画状态：选中格、提示对、进行中的消除折线与洗牌动画。
 * 由 index.ts 持有并驱动，逻辑层不感知；renderMahjong 读取公开字段绘制。
 */
export interface MahjongView {
    /** 当前选中的牌格（null 未选）。 */
    selected: Pos | null;
    /** 展示中的提示对（超时后渲染层自动不再绘制）。 */
    hint: [Pos, Pos] | null;
    hintStartMs: number;
    /** 洗牌动画开始时刻（越界值表示不在动画中）。 */
    shuffleStartMs: number;
    /** 进行中的消除折线。 */
    clears: ClearFx[];
    /** 粒子系统（消除爆点）。 */
    particles: {
        burst(x: number, y: number, color: string, count?: number, speed?: number): void;
        tick(ctx: CanvasRenderingContext2D, dtMs: number): void;
        size(): number;
    };
    /** 选中 / 取消选中一张牌。 */
    select(p: Pos | null): void;
    /** 展示一对提示。 */
    showHint(pair: [Pos, Pos]): void;
    /** 播放一条消除折线动画。 */
    playClear(path: Pos[]): void;
    /** 播放洗牌抖动动画。 */
    playShuffle(): void;
    /** 是否仍有进行中的动画（决定是否需要重绘）。 */
    active(nowMs: number): boolean;
    /** 清空全部动画状态（重开 / 换关时调用）。 */
    reset(): void;
}
/** 建立一个空的渲染视图状态。 */
export declare function createMahjongView(): MahjongView;
/**
 * 画一帧完整场景。
 * @param ctx - 画布上下文。
 * @param state - 逻辑状态。
 * @param view - 渲染动画状态。
 * @param paused - 是否显示暂停遮罩。
 */
export declare function renderMahjong(ctx: CanvasRenderingContext2D, state: MahjongState, view: MahjongView, paused: boolean, dtMs: number): void;
