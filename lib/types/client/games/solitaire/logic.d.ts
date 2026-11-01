/**
 * 纸牌接龙（Klondike Solitaire）纯逻辑：标准 52 张牌，确定性洗牌
 * mulberry32(seed + 局号)，发 7 列（第 i 列 i+1 张、列首翻开）+ 发牌堆
 * + 废牌堆 + 4 个基础堆。规则：列上叠牌红黑交替且比上一张小 1，空列只
 * 能放 K，基础堆同花色从 A 递增。计分：进基础堆 +10、翻开暗牌 +5。
 * 所有操作均为纯函数（就地更新 + undo 快照栈），同一 seed 与操作序列
 * 必然得到同一状态，可脱离 DOM 直接模拟验证。
 */
/** 逻辑画布宽度 px。 */
export declare const W = 560;
/** 逻辑画布高度 px。 */
export declare const H = 680;
/** HUD 条高度 px（含在 H 内）。 */
export declare const HUD_H = 34;
/** 牌面宽度 px。 */
export declare const CARD_W = 70;
/** 牌面高度 px。 */
export declare const CARD_H = 98;
/** 顶排（发牌堆/废牌堆/基础堆）y 坐标。 */
export declare const TOP_Y: number;
/** 列区 y 坐标。 */
export declare const COL_Y: number;
/** 暗牌纵向层叠偏移 px。 */
export declare const OFFSET_DOWN = 18;
/** 明牌纵向层叠偏移 px。 */
export declare const OFFSET_UP = 26;
/** 花色记号（索引 0-3：黑桃/红心/方块/梅花，红黑红黑交替判定用）。 */
export declare const SUITS: readonly ["♠", "♥", "♦", "♣"];
/** 牌点显示（1-13 → A..K）。 */
export declare const RANKS: readonly ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
/** 一张牌：花色 0-3、点数 1-13、是否翻开。 */
export interface Card {
    suit: number;
    rank: number;
    faceUp: boolean;
}
/** 一张牌是否红色（红心/方块）。 */
export declare function isRed(card: Card): boolean;
/** 移动源：废牌堆顶 / 基础堆顶 / 列中某张已翻开的牌（含其下整段）。 */
export type CardSource = {
    zone: 'waste';
} | {
    zone: 'foundation';
    index: number;
} | {
    zone: 'column';
    index: number;
    cardIndex: number;
};
/** 点击命中的区域。 */
export type HitZone = {
    zone: 'stock';
} | {
    zone: 'waste';
} | {
    zone: 'foundation';
    index: number;
} | {
    zone: 'column';
    index: number;
    cardIndex: number;
} | null;
/** 一局游戏的完整可测状态。 */
export interface SolitaireState {
    /** 基础 seed（与局号相加后用于洗牌）。 */
    seed: number;
    /** 局号（从 1 起，R 重开 +1，换一副新牌）。 */
    gameNo: number;
    /** 累计分。 */
    score: number;
    /** 步数（每次有效操作 +1）。 */
    moves: number;
    /** 发牌堆（牌背朝上，从末尾发牌）。 */
    stock: Card[];
    /** 废牌堆（顶为末尾）。 */
    waste: Card[];
    /** 4 个基础堆（按花色索引，顶为末尾）。 */
    foundations: Card[][];
    /** 7 列（顶为末尾）。 */
    columns: Card[][];
    /** undo 快照栈（每次有效操作前压入完整克隆）。 */
    undoStack: string[];
    /** 是否已胜利（4 基础堆全满）。 */
    won: boolean;
}
/**
 * mulberry32 确定性伪随机数发生器。
 * @param seed - 32 位种子。
 * @returns 返回 [0,1) 随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/**
 * 深克隆状态（undo 快照 / 测试比对用）。
 * @param state - 当前状态。
 * @returns 结构完全独立的副本。
 */
export declare function cloneState(state: SolitaireState): SolitaireState;
/**
 * 生成一副标准 52 张牌并用 mulberry32(seed+局号) Fisher-Yates 洗牌。
 * @param seed - 基础种子。
 * @param gameNo - 局号。
 * @returns 洗好的 52 张牌（全部未翻开）。
 */
export declare function shuffledDeck(seed: number, gameNo: number): Card[];
/**
 * 新开一局：洗牌、发 7 列（列 i 有 i+1 张、末张翻开），余牌入发牌堆。
 * @param seed - 基础种子。
 * @param gameNo - 局号（默认 1）。
 * @returns 初始状态。
 */
export declare function createSolitaire(seed: number, gameNo?: number): SolitaireState;
/** 顶排第 slot 个槽位（0 发牌堆、1 废牌堆、3-6 基础堆）的 x 坐标。 */
export declare function slotX(slot: number): number;
/** 第 index 列的 x 坐标（与顶排槽位对齐）。 */
export declare function colX(index: number): number;
/** 列内第 cardIndex 张牌的 y 坐标。 */
export declare function cardY(column: Card[], cardIndex: number): number;
/**
 * 命中检测：逻辑坐标落在哪个可点击对象上（列取命中的具体牌；列底以下
 * 的空白算作命中该列最后一张牌，便于点很长的牌堆）。
 * @param state - 当前状态。
 * @param x - 逻辑坐标 x。
 * @param y - 逻辑坐标 y。
 * @returns 命中区域描述，未命中返回 null。
 */
export declare function hitTest(state: SolitaireState, x: number, y: number): HitZone;
/**
 * 一张牌能否放到某列列顶：红黑交替且比顶牌小 1；空列只收 K。
 * @param state - 当前状态。
 * @param card - 待放的牌。
 * @param colIndex - 目标列号。
 * @returns true 表示合法。
 */
export declare function canPlaceOnColumn(state: SolitaireState, card: Card, colIndex: number): boolean;
/**
 * 一张牌能否收到其花色基础堆：顶牌大 1（空堆收 A）。
 * @param state - 当前状态。
 * @param card - 待收的牌。
 * @returns true 表示合法。
 */
export declare function canPlaceOnFoundation(state: SolitaireState, card: Card): boolean;
/**
 * 从发牌堆翻一张到废牌堆（一次一张）；发牌堆空时把废牌堆洗回发牌堆。
 * @param state - 目标状态（就地更新）。
 * @returns true 表示发生了变化。
 */
export declare function drawStock(state: SolitaireState): boolean;
/**
 * 把源牌序列移到某列（列规则校验，失败不改动）。
 * @param state - 目标状态（就地更新）。
 * @param src - 移动源。
 * @param colIndex - 目标列号。
 * @returns true 表示移动成功。
 */
export declare function moveToColumn(state: SolitaireState, src: CardSource, colIndex: number): boolean;
/**
 * 把源顶牌收进其花色基础堆（+10 分，失败不改动）。
 * @param state - 目标状态（就地更新）。
 * @param src - 移动源（只取顶牌）。
 * @returns true 表示移动成功。
 */
export declare function moveToFoundation(state: SolitaireState, src: CardSource): boolean;
/**
 * 回退一步：弹出最近一次操作的快照恢复（分数/步数/牌局全还原）。
 * @param state - 目标状态（就地更新）。
 * @returns true 表示回退成功（栈空返回 false）。
 */
export declare function undo(state: SolitaireState): boolean;
/**
 * 为源顶牌自动寻找合法目标：优先基础堆，其次最左可行列。
 * @param state - 当前状态。
 * @param src - 移动源（只对单牌生效：废牌堆 / 基础堆 / 列顶）。
 * @returns 目标描述，或 null 表示无处可去。
 */
export declare function findAutoTarget(state: SolitaireState, src: CardSource): {
    to: 'foundation';
} | {
    to: 'column';
    index: number;
} | null;
/**
 * 列中某张已翻开的牌（含下方整段）作为合法移动源；命中暗牌时取其上
 * 无明牌则不可选，返回 null。供交互层把点击翻译成移动源。
 * @param state - 当前状态。
 * @param hit - 命中区域。
 * @returns 移动源，或 null（不可选）。
 */
export declare function selectableSource(state: SolitaireState, hit: HitZone): CardSource | null;
