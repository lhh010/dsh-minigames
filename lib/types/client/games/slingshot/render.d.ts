/**
 * 弹弓复仇渲染层：卡通天空草地、弹弓皮筋、拖尾鸟弹、木纹/石纹/冰块、
 * 晕头小猪、碎裂与命中粒子、上次弹道虚影、星级结算。无状态，全部
 * 状态由调用方传入；复用 theme.ts 公共设施。
 */
import { type Material, type SlingshotState } from './logic.ts';
export declare const MAT_COLORS: Record<Material, string>;
export declare function renderSlingshot(ctx: CanvasRenderingContext2D, state: SlingshotState, aim: {
    from: {
        x: number;
        y: number;
    };
    to: {
        x: number;
        y: number;
    };
} | null, trail: readonly {
    x: number;
    y: number;
}[], paused: boolean): void;
