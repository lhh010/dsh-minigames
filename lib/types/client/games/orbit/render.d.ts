import { type OrbitState } from './logic.ts';
/** 一份按关卡缓存的渲染资源：星空与参考解路径（提示演示）。 */
export interface OrbitRenderer {
    /** 绘制一帧完整场景（含 HUD 与结算 overlay）。 */
    draw(ctx: CanvasRenderingContext2D, state: OrbitState, paused: boolean): void;
    /** 在某点触发撞击爆炸粒子。 */
    burst(x: number, y: number, color?: string): void;
}
/**
 * 创建渲染器（星空与提示路径按需缓存）。
 * @param seed - 与逻辑侧相同的注入种子（星空可复现）。
 * @returns 渲染器句柄。
 */
export declare function createOrbitRenderer(seed: number): OrbitRenderer;
