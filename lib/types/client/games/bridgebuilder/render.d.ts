/**
 * 建桥大师 Bridge Builder 画布渲染：侧视峡谷剖面（两岸崖壁 + 谷底水
 * 面）、可建网格点、锚点 / 立柱、杆件（测试期按应力比绿→金→红变
 * 色）、小车（车轮随里程滚动、车身随两轮高度倾斜）、断裂粒子由
 * index 层驱动共享粒子池。渲染器无状态（全部信息由 {@link
 * BuilderView} 传入），同一输入绘制结果确定。
 */
import { type BridgeBeam, type BridgeLevel, type BridgeNode, type RunWorld } from './logic.ts';
/** 逻辑画布尺寸。 */
export declare const LOGICAL_W = 840;
export declare const LOGICAL_H = 490;
/** 网格列 → 逻辑像素横坐标。 */
export declare function px(x: number): number;
/** 网格行 → 逻辑像素纵坐标。 */
export declare function py(y: number): number;
/** 一帧的全部绘制输入（由 index 持有并驱动）。 */
export interface BuilderView {
    /** 关卡定义。 */
    level: BridgeLevel;
    /** 0 起关卡下标。 */
    levelIndex: number;
    /** 建造蓝图杆件（build 与 test 模式都保留，供测试结束后回建）。 */
    beams: BridgeBeam[];
    /** 测试物理世界（仅 test 模式非空；杆件坐标取自节点实况）。 */
    world: RunWorld | null;
    /** build = 建造期；test = 测试期。 */
    mode: 'build' | 'test';
    /** 测试结果（测试结束才有）。 */
    outcome: 'running' | 'won' | 'failed' | null;
    /** 建造期已选第一格点。 */
    selected: BridgeNode | null;
    /** 建造期悬停格点。 */
    hover: BridgeNode | null;
    /** 暂停中。 */
    paused: boolean;
    /** 过关得分（won 时显示）。 */
    score: number | null;
    /** 车轮累计滚动里程（逻辑像素，驱动轮辐旋转）。 */
    travel: number;
}
/**
 * 最近网格点（吸附半径内才算）。
 * @param x 逻辑像素横坐标。
 * @param y 逻辑像素纵坐标。
 * @param level 关卡（提供可建范围）。
 */
export declare function nearestNode(x: number, y: number, level: BridgeLevel): BridgeNode | null;
/**
 * 命中杆件（点到线段距离 < 拆除容差；build 模式按网格坐标）。
 * @param x 逻辑像素横坐标。
 * @param y 逻辑像素纵坐标。
 * @param beams 蓝图杆件。
 * @returns 命中杆件下标；落空返回 null。
 */
export declare function pickBeam(x: number, y: number, beams: readonly BridgeBeam[]): number | null;
/** 应力比 → 杆件颜色（绿 → 金 → 红）。 */
export declare function stressColor(ratio: number): string;
/**
 * 绘制一整帧：背景 → 峡谷 → 网格 → 杆件 → 小车 → HUD → 结算 overlay。
 * @param view 见 {@link BuilderView}。
 */
export declare function renderBuilderScene(ctx: CanvasRenderingContext2D, view: BuilderView): void;
