/**
 * 分子构建 (Molecule) 画布渲染器：化学风盘面（网格暗纹 + 墙块）、球形
 * 原子（元素符号 + 外圈剩余空价刻痕，双线键连线）、主原子高亮、推挤
 * 补间动画、目标分子式面板（元素达成点亮）、步数/参考 HUD 与过关
 * overlay（按最终几何缩放展示分子结构）。无状态：全部信息来自传入的
 * state 与 view；共享视觉件来自 ../theme.ts。
 */
import { type Atom, type MoleculeState } from './logic.ts';
/** 逻辑画布尺寸（所有关卡共用，盘面居中自适应内嵌）。 */
export declare const LOGICAL_W = 460;
export declare const LOGICAL_H = 540;
/** HUD 高度（两行：关卡/目标 + 元素达成条）。 */
export declare const HUD_H = 74;
/** 单元格边长。 */
export declare const CELL = 44;
/** 渲染视图：暂停/全通、推挤动画与毫秒时钟。 */
export interface MoleculeView {
    paused: boolean;
    /** 最后一关过关（终局画面）。 */
    won: boolean;
    /** 进行中的推挤补间；null 为静止。 */
    push: {
        moved: {
            id: number;
            from: {
                r: number;
                c: number;
            };
            to: {
                r: number;
                c: number;
            };
        }[];
        t: number;
    } | null;
    /** 毫秒时钟（动画缓动用）。 */
    timeMs: number;
}
/**
 * 某格中心的逻辑坐标（粒子/闪烁定位用）。
 * @param state - 状态。
 * @param r - 行。
 * @param c - 列。
 * @returns 中心点。
 */
export declare function cellCenter(state: MoleculeState, r: number, c: number): {
    x: number;
    y: number;
};
/**
 * 某原子中心的逻辑坐标（当前网格位置）。
 * @param state - 状态。
 * @param atom - 原子。
 * @returns 中心点。
 */
export declare function atomCenter(state: MoleculeState, atom: Atom): {
    x: number;
    y: number;
};
/**
 * 画一帧主场景（不含 overlay 与粒子）。
 * @param ctx - 画布上下文。
 * @param state - 游戏状态。
 * @param view - 视图参数。
 */
export declare function renderMolecule(ctx: CanvasRenderingContext2D, state: MoleculeState, view: MoleculeView): void;
/**
 * 画过关/暂停 overlay。过关时按最终键合几何缩放展示分子结构小图。
 * @param ctx - 画布上下文。
 * @param state - 游戏状态。
 * @param kind - 'won'（含最后一关全通意味，由调用方决定文案）或 'paused'。
 */
export declare function renderMoleculeOverlay(ctx: CanvasRenderingContext2D, state: MoleculeState, kind: 'won' | 'paused'): void;
