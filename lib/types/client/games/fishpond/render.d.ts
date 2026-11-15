/**
 * 鱼塘物语渲染层：俯视鱼塘（水面波纹、鱼的游动轨迹与摆尾转弯、大小阶段
 * 体型、颜色基因渲染、饥饿气泡、出售确认挂牌）、钓鱼场景（力度条甜区、
 * 浮漂沉浮动画、提竿水花、鱼影游过）、市场面板（六品种每日行情与涨跌、
 * 鱼苗/鱼粮/扩塘商店卡）、金币/体力/鱼粮/游戏日/图鉴 HUD 与过关遮罩。
 * 基于共享主题工具，纯 canvas 绘制；观察金币与钓鱼结果触发粒子。
 */
import type { FishpondState, Genes } from './logic.ts';
import { SPECIES_ORDER } from './logic.ts';
export declare const LOGICAL_W = 760;
export declare const LOGICAL_H = 540;
/** 三个区域视图。 */
export type View = 'pond' | 'fish' | 'market';
/** 结束今天按钮。 */
export declare const NEXT_DAY_RECT: {
    x: number;
    y: number;
    w: number;
    h: number;
};
/** 塘格中心（3 列网格，行优先），供渲染与命中测试共用。 */
export declare function slotCenter(slot: number, slots: number): {
    x: number;
    y: number;
};
/**
 * 命中测试：逻辑坐标落在哪个塘格（3 列网格矩形判定）。
 * @param x - 逻辑横坐标。
 * @param y - 逻辑纵坐标。
 * @param state - 游戏状态。
 * @returns 塘格下标，未命中返回 null。
 */
export declare function pondSlotAt(x: number, y: number, state: FishpondState): number | null;
/**
 * 命中测试：逻辑坐标点中哪个导航标签。
 * @param x - 逻辑横坐标。
 * @param y - 逻辑纵坐标。
 * @returns 视图 id，未命中返回 null。
 */
export declare function navAt(x: number, y: number): View | null;
/** 商店条目。 */
export type ShopItem = {
    kind: 'fry';
    species: (typeof SPECIES_ORDER)[number] & ('crucian' | 'guppy' | 'carp');
} | {
    kind: 'food';
} | {
    kind: 'expand';
};
/**
 * 命中测试：逻辑坐标点中哪个商店条目。
 * @param x - 逻辑横坐标。
 * @param y - 逻辑纵坐标。
 * @returns 商店条目，未命中返回 null。
 */
export declare function shopAt(x: number, y: number): ShopItem | null;
/** 基因 → 体表颜色（三通道 0-9 映射 0-255）。 */
export declare function geneColor(genes: Genes): string;
/**
 * 画整帧：背景 → HUD → 当前区域视图 → 粒子 → 过关/暂停遮罩。
 * 观察金币增长触发金粒子、钓鱼入 result 触发水花。
 * @param ctx - 画布上下文。
 * @param state - 游戏状态。
 * @param view - 当前区域视图。
 * @param paused - 是否暂停。
 */
export declare function renderFishpond(ctx: CanvasRenderingContext2D, state: FishpondState, view: View, paused: boolean): void;
