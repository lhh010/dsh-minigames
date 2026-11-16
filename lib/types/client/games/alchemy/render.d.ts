export declare const LOGICAL_W = 640;
export declare const LOGICAL_H = 460;
export declare const HUD_H = 30;
/** 元素总数（图鉴计数与 HUD 用）。 */
export declare const TOTAL_ELEMENTS: number;
export declare const SHELF_RECT: {
    readonly x: 8;
    readonly y: 38;
    readonly w: 176;
    readonly h: number;
};
/** 元素架的一行（分组标题或元素项）。 */
export interface ShelfRow {
    kind: 'header' | 'item';
    /** 标题文本或元素 id。 */
    key: string;
    /** 行顶 y（未滚动坐标）。 */
    y: number;
}
/**
 * 计算元素架行布局：按类别分段，段内按发现顺序（state.discovered 的
 * 顺序即库声明顺序的子序列，基本元素总在前）。
 * @param discovered - 已发现元素 id 列表。
 */
export declare function shelfRows(discovered: readonly string[]): ShelfRow[];
/** 元素架最大滚动量（内容不足一屏时为 0）。 */
export declare function shelfMaxScroll(discovered: readonly string[]): number;
/**
 * 元素架命中检测。
 * @returns 命中的元素 id；空白或未命中返回 null。
 */
export declare function shelfItemAt(x: number, y: number, scroll: number, discovered: readonly string[]): string | null;
export declare const SLOT_RECTS: readonly [{
    readonly x: 214;
    readonly y: 120;
    readonly w: 86;
    readonly h: 86;
}, {
    readonly x: 340;
    readonly y: 120;
    readonly w: 86;
    readonly h: 86;
}];
export declare const RESULT_RECT: {
    readonly x: 285;
    readonly y: 252;
    readonly w: 70;
    readonly h: 70;
};
export interface ButtonRect {
    x: number;
    y: number;
    w: number;
    h: number;
    key: 'clear' | 'codex' | 'hint';
}
export declare const BUTTONS: readonly ButtonRect[];
/** 工作台/按钮命中：返回命中的按钮 key 或槽位下标，未命中 null。 */
export declare function hitUi(x: number, y: number): 'clear' | 'codex' | 'hint' | 0 | 1 | null;
export declare const CODEX_COLS = 8;
export declare const CODEX_CELL_W = 72;
export declare const CODEX_CELL_H = 58;
export declare const CODEX_TOP = 64;
/** 图鉴可滚动的最大量。 */
export declare function codexMaxScroll(): number;
/** 渲染一帧所需的全部游戏视图状态（index.ts 持有并传入）。 */
export interface AlchemyView {
    /** 已发现元素 id（发现顺序）。 */
    discovered: string[];
    /** 工作台两槽内容（null = 空）。 */
    slots: Array<string | null>;
    /** 最近一次合成/提示的结果提示文案。 */
    message: string;
    /** 文案情绪：good=发现，bad=无反应，info=其余。 */
    messageKind: 'good' | 'bad' | 'info';
    /** 进行中的合成动画（t: 0..1）；result 为 null 表示无配方（消散动画）。 */
    merge: {
        a: string;
        b: string;
        result: string | null;
        t: number;
    } | null;
    shelfScroll: number;
    codexOpen: boolean;
    codexScroll: number;
    paused: boolean;
    /** 刚达成的里程碑关卡（1..5），显示过关覆盖层，空格继续。 */
    clearedLevel: number | null;
    /** 第 5 里程碑达成（通关）。 */
    complete: boolean;
    /** 剩余提示次数。 */
    hintBudget: number;
    /** 已揭示的半提示（元素 id → 原料 id）。 */
    hints: Record<string, string>;
    score: number;
}
/**
 * 绘制一帧主场景（图鉴开启时画图鉴覆盖层，否则工作台）。
 * @param ctx - 逻辑坐标系下的 2d 上下文（fitCanvas 已设 transform）。
 * @param view - 当前视图状态。
 */
export declare function renderAlchemy(ctx: CanvasRenderingContext2D, view: AlchemyView): void;
