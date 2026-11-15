import { type JigsawState, type PatternScene } from './logic.ts';
/** 吸附/提示时迸出的一颗粒子（index 每帧推进，render 只负责绘制）。 */
export interface JigsawSpark {
    /** 当前横坐标。 */
    x: number;
    /** 当前纵坐标。 */
    y: number;
    /** 横向速度（像素/秒）。 */
    vx: number;
    /** 纵向速度（像素/秒，含重力由 index 推进）。 */
    vy: number;
    /** 已存活毫秒。 */
    life: number;
    /** 总寿命毫秒。 */
    maxLife: number;
    /** 颜色。 */
    color: string;
}
/** 渲染所需的全部游戏视图状态（index.ts 持有并传入）。 */
export interface JigsawView {
    /** 关卡状态。 */
    state: JigsawState;
    /** 本关图案场景（碎片裁切与预览共用）。 */
    scene: PatternScene;
    /** 选中的碎片编号（无则 null）。 */
    selected: number | null;
    /** 正在拖拽（选中碎片抬起放大）。 */
    dragging: boolean;
    /** 活动吸附粒子。 */
    sparks: JigsawSpark[];
    /** 累计总分（HUD 展示与上报共用）。 */
    score: number;
    /** 过关待进入下一关。 */
    cleared: boolean;
    /** 五关全部完成。 */
    complete: boolean;
    /** 暂停（覆盖层）。 */
    paused: boolean;
}
/**
 * 绘制一帧百变拼图。
 * @param ctx - 画布上下文。
 * @param view - 视图状态（含逻辑状态、图案与粒子）。
 */
export declare function renderJigsaw(ctx: CanvasRenderingContext2D, view: JigsawView): void;
/**
 * 命中测试：返回逻辑坐标 (x, y) 处最上层的未吸附碎片编号，无则 null。
 * @param x - 逻辑横坐标。@param y - 逻辑纵坐标。
 * @param state - 关卡状态。
 */
export declare function pieceHit(x: number, y: number, state: JigsawState): number | null;
/**
 * 生成一次吸附粒子（index 在吸附/提示成功时调用）。
 * @param x - 迸发中心 x。@param y - 迸发中心 y。
 * @param count - 粒子数。
 * @param color - 粒子颜色。
 * @returns 新生成的粒子数组。
 */
export declare function makeSparks(x: number, y: number, count: number, color: string): JigsawSpark[];
