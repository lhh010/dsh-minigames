/**
 * 剪绳喂糖渲染层：卡通风侧视盘面——顶部木钉挂点、麻绳绳索、
 * 条纹高光糖果、张嘴等糖的小怪物、旋转星星、尖刺、气泡、糖果轨迹
 * 拖尾、剪刀划线，以及命/剪数/星星 HUD 与过关 overlay。无状态，
 * 全部状态由调用方传入；复用 theme.ts 公共设施。
 */
import { type CutRopeState } from './logic.ts';
export interface RenderExtras {
    /** 糖果轨迹拖尾。 */
    trail: readonly {
        x: number;
        y: number;
    }[];
    /** 当前剪刀划线（按下到当前指针）。 */
    swipe: {
        x1: number;
        y1: number;
        x2: number;
        y2: number;
    } | null;
    /** 动画时钟 ms（怪物张嘴/星星旋转/气泡浮动）。 */
    animMs: number;
    paused: boolean;
}
/** 渲染整帧（无状态：全部输入由参数传入）。 */
export declare function renderCutRope(ctx: CanvasRenderingContext2D, state: CutRopeState, extras: RenderExtras): void;
