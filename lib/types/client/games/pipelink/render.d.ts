/**
 * 「管道连连」渲染：金属质感管件（描边分层高光）、蓝色水流沿 BFS 填充
 * 序渐进灌入、源头泵/出口桶、毒水管红色警示条纹、悬停旋转箭头、顶部
 * 关卡/步数/分数 HUD 与底部水位计、过关/失败/暂停 overlay。纯绘制，
 * 无 DOM 无状态；布局常量与 index.ts 共享。
 */
import { createParticles, type ParticleSystem } from '../theme.ts';
import { type PipelinkState, type Pos } from './logic.ts';
/** 逻辑画布尺寸与网格布局常量。 */
export declare const CELL = 52;
export declare const MAX_SIZE = 9;
export declare const MARGIN = 16;
export declare const HUD_H = 46;
export declare const FOOT_H = 30;
export declare const LOGICAL_W: number;
export declare const LOGICAL_H: number;
export interface PipelinkViewOptions {
    paused: boolean;
    /** 悬停格（画旋转箭头）。 */
    hover?: Pos | null;
    /** 粒子系统（过关水花）。 */
    particles?: ParticleSystem;
}
/** 主渲染入口：背景 → 盘面 → 水流 → HUD → 粒子 → overlay。 */
export declare function renderPipelink(ctx: CanvasRenderingContext2D, state: PipelinkState, opts: PipelinkViewOptions): void;
/** 共享粒子系统工厂（re-export 便于 index 使用同一实现）。 */
export { createParticles };
