/**
 * 传送带工厂 Factory 渲染层：工厂蓝图风网格盘面、箭头传送带（随朝向
 * 旋转）、配方机器（字形 + 配方角标 + 产出进度条）、出口源 / 需求槽、
 * 物料色点流动、堵死红闪、需求进度条、放置余量与运行 tick HUD、
 * 悬停幽灵预览、过关 / 超时 / 暂停 overlay。全部为纯 canvas 绘制；
 * 状态由 index.ts 持有并注入 FactoryView，本模块不持有可变状态。
 */
import { type ParticleSystem } from '../theme.ts';
import { type Dir, type FactoryLevel, type FactorySim, type Mat, type Placement } from './logic.ts';
/** 逻辑画布尺寸（720×512，fitCanvas 负责适配宿主）。 */
export declare const VIEW_W = 720;
export declare const VIEW_H = 512;
/** 物料显示色（点、源、需求槽共用）。 */
export declare const MAT_COLOR: Readonly<Record<Mat, string>>;
/** 渲染所需的全部游戏状态（index.ts 持有并逐帧注入）。 */
export interface FactoryView {
    /** 当前关卡。 */
    level: FactoryLevel;
    /** 玩家放置（带 + 机器）。 */
    placements: Placement[];
    /** 当前工具：'belt' | 'erase' | 机器 id。 */
    tool: string;
    /** 放置朝向（幽灵预览与新放置共用）。 */
    cursorDir: Dir;
    /** 悬停格（画布坐标换算；无悬停为 null）。 */
    hover: {
        x: number;
        y: number;
    } | null;
    /** edit=摆盘 / run=模拟中 / won=过关 / fail=超时未达标。 */
    mode: 'edit' | 'run' | 'won' | 'fail';
    /** 暂停中（叠加 overlay）。 */
    paused: boolean;
    /** 短暂提示文本与剩余毫秒。 */
    message: string;
    messageTtl: number;
    /** 关卡总数（HUD 显示 N/总数）。 */
    levelCount: number;
    /** 运行中的模拟器（edit 态为 null）。 */
    sim: FactorySim | null;
    /** 超时原因文案。 */
    failReason: string;
    /** 过关 / 交付粒子。 */
    particles: ParticleSystem;
    /** 累计时长 ms（红闪与呼吸相位）。 */
    time: number;
}
/** 盘面几何：格边长与原点。 */
export interface BoardMetrics {
    cell: number;
    bx: number;
    by: number;
}
/**
 * 计算盘面几何（等比缩放居中，含左右与上下边距）。
 * @param level 当前关卡。
 * @returns 格边长与盘面原点。
 */
export declare function boardMetrics(level: FactoryLevel): BoardMetrics;
/**
 * 画布坐标 → 悬停格。
 * @param px 逻辑 x。
 * @param py 逻辑 y。
 * @param level 当前关卡。
 * @returns 格坐标，盘外返回 null。
 */
export declare function cellAt(px: number, py: number, level: FactoryLevel): {
    x: number;
    y: number;
} | null;
/** 工具面板按钮描述。 */
export interface PaletteButton {
    label: string;
    tool: string;
}
/**
 * 工具面板按钮列表（传送带 + 各关机器 + 擦除）。
 * @param level 当前关卡。
 * @returns 按钮描述数组。
 */
export declare function paletteButtons(level: FactoryLevel): PaletteButton[];
/**
 * 第 index 个工具按钮矩形（整行居中）。
 * @param index 按钮序号。
 * @param count 按钮总数。
 * @returns 矩形 {x, y, w, h}。
 */
export declare function paletteRect(index: number, count: number): {
    x: number;
    y: number;
    w: number;
    h: number;
};
/**
 * 命中测试：点击坐标落在哪个工具按钮。
 * @param px 逻辑 x。
 * @param py 逻辑 y。
 * @param level 当前关卡。
 * @returns 按钮 tool 标识，未命中返回 null。
 */
export declare function paletteHit(px: number, py: number, level: FactoryLevel): string | null;
/**
 * 第 index 个需求进度条矩形（整行等分居中，间隔 24）。
 * @param index 需求槽序号。
 * @param count 需求槽数。
 * @returns 矩形 {x, y, w, h}。
 */
export declare function demandRect(index: number, count: number): {
    x: number;
    y: number;
    w: number;
    h: number;
};
/**
 * 渲染一帧：背景 → HUD → 盘面（格 / 带 / 机器 / 源 / 需求 / 物料 / 红闪 /
 * 幽灵预览）→ 需求进度条 → 工具面板 → 提示 / 速览 → 粒子 → overlay。
 * @param ctx 画布上下文（fitCanvas 已施加逻辑坐标变换）。
 * @param view 游戏状态。
 * @param dtMs 本帧毫秒（粒子推进用）。
 */
export declare function renderFactory(ctx: CanvasRenderingContext2D, view: FactoryView, dtMs: number): void;
