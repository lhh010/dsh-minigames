/**
 * 疯狂八号（Crazy Eights，UNO 前身）纯逻辑：52 张标准牌（4 花色 × 13
 * 点），1v1 人类对 AI，每人起手 5 张、翻 1 张作弃牌堆顶。轮流出牌：
 * 与顶牌同花色或同点数可出；8 为万能牌，出时宣告下一花色；Q（皇后）
 * 为跳过牌——出 Q 后下家被跳过，轮转回到出牌者本人。无牌可出则从牌堆
 * 摸 1 张：摸到可出的牌可打出（也可放弃出牌权直接过轮），摸到不可出
 * 的牌自动过轮。牌堆耗尽时把弃牌堆（保留顶牌）重洗为新牌堆；双方连
 * 续无牌可出且无牌可摸判本局平局。任一方手牌出完赢一局，先赢
 * WINS_TO_MATCH（2）局（3 局 2 胜）赢整场，每局先手在两家间交替。
 *
 * 所有随机（洗牌、AI 决策噪声）都走注入 seed 的 mulberry32，同一
 * seed 与同一操作序列必然得到同一状态，可脱离 DOM 直接模拟验证。
 */
/** 起手手牌张数。 */
export declare const HAND_SIZE = 5;
/** 赢得多少局后赢得整场（3 局 2 胜）。 */
export declare const WINS_TO_MATCH = 2;
/** 跳过牌的点数（Q）。 */
export declare const SKIP_RANK = 12;
/** 万能牌的点数（8）。 */
export declare const WILD_RANK = 8;
/** 一张牌：花色 0-3（♠♥♦♣）、点数 1-13（A..K）。 */
export interface Card {
    suit: number;
    rank: number;
}
/** 玩家编号：0 人类、1 AI。 */
export type PlayerId = 0 | 1;
/** 一局的可测完整状态（rng 为 seed 派生的内部随机源，不参与快照比较）。 */
export interface Crazy8State {
    seed: number;
    /** 当前局序号（从 1 起）。 */
    round: number;
    /** 双方已赢局数（0 人类 / 1 AI）。 */
    wins: [number, number];
    /** 牌堆（摸牌从末尾弹出）。 */
    drawPile: Card[];
    /** 弃牌堆（末位为顶牌）。 */
    discard: Card[];
    /** 双方手牌。 */
    hands: [Card[], Card[]];
    /** 当前行动方。 */
    turn: PlayerId;
    /** 当前有效花色（8 宣告后覆盖顶牌花色）。 */
    activeSuit: number;
    /** 人类刚打出 8，等待宣告花色。 */
    pendingSuitChoice: boolean;
    /** 出 Q 置位：下一次轮转时跳过下家。 */
    skipPending: boolean;
    /** 刚摸到的牌可出（当前玩家仍持有出牌权）。 */
    drawnPlayable: boolean;
    /** 连续无出牌的回合数（≥2 且无牌可摸判平局）。 */
    passStreak: number;
    /** 弃牌堆重洗次数。 */
    reshuffles: number;
    /** 本局结果：玩家编号 / -1 平局 / null 进行中。 */
    roundWinner: PlayerId | -1 | null;
    /** 整场结果：玩家编号 / null 进行中。 */
    matchWinner: PlayerId | null;
    /** 面向玩家的提示文案。 */
    message: string;
    /** 内部确定性随机源（seed+局号派生）。 */
    rng: () => number;
}
/**
 * mulberry32 确定性伪随机数发生器。
 * @param seed - 非负整数种子。
 * @returns 返回 [0,1) 随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/**
 * 构造一副洗好的 52 张标准牌。
 * @param seed - 种子。
 * @param round - 局号（混合进种子）。
 */
export declare function makeDeck(seed: number, round: number): Card[];
/**
 * 构造一张指定牌（测试布阵用）。
 * @param rank - 点数 1-13。
 * @param suit - 花色 0-3，默认黑桃。
 */
export declare function makeCard(rank: number, suit?: number): Card;
/**
 * 开一场新比赛。
 * @param seed - 注入种子，决定全部洗牌与 AI 噪声。
 * @returns 初始状态（人类先手）。
 */
export declare function createCrazy8(seed: number): Crazy8State;
/**
 * 弃牌堆顶牌。
 * @param state - 目标状态。
 */
export declare function topCard(state: Crazy8State): Card;
/**
 * 出牌合法性：8 万能，否则须与有效花色同花或与顶牌同点。
 * @param card - 待出的牌。
 * @param activeSuit - 当前有效花色。
 * @param topRank - 顶牌点数。
 */
export declare function canPlayCard(card: Card, activeSuit: number, topRank: number): boolean;
/**
 * 当前行动方可出的手牌下标列表。
 * @param state - 目标状态。
 */
export declare function playableIndices(state: Crazy8State): number[];
/**
 * 当前行动方是否有可出的牌。
 * @param state - 目标状态。
 */
export declare function hasPlayable(state: Crazy8State): boolean;
/**
 * 出一张手牌。人类出 8 不带 chosenSuit 时进入花色宣告（等待
 * chooseSuit），其余情况立即结算（8 的花色缺省取 AI 策略的多数花色）。
 * @param state - 目标状态。
 * @param index - 手牌下标。
 * @param chosenSuit - 出 8 时宣告的花色（AI 或脚本必填；人类可省）。
 * @returns 是否合法并已执行（宣告中记为已执行）。
 */
export declare function playCard(state: Crazy8State, index: number, chosenSuit?: number): boolean;
/**
 * 人类出 8 后宣告花色，完成该次出牌的结算。
 * @param state - 目标状态。
 * @param suit - 花色 0-3。
 * @returns 是否生效。
 */
export declare function chooseSuit(state: Crazy8State, suit: number): boolean;
/**
 * 摸一张：牌堆耗尽时先把弃牌堆（保留顶牌）重洗为新牌堆；弃牌堆也
 * 只剩顶牌（全部牌在两家手里）时无牌可摸。
 * @param state - 目标状态。
 * @returns 摸到的牌，无牌可摸返回 null。
 */
export declare function drawCard(state: Crazy8State): Card | null;
/**
 * 无牌可出时的摸牌/过轮：摸到可出的牌保留出牌权（drawnPlayable 置
 * 位，可继续 playCard 或再次 passOrDraw 放弃出牌权）；摸到不可出的
 * 牌或无牌可摸则自动过轮。连续两回合无出牌判本局平局。
 * @param state - 目标状态。
 */
export declare function passOrDraw(state: Crazy8State): void;
/**
 * AI 花色宣告策略：自己手里张数最多的花色（并列取小下标，空手取 0）。
 * @param state - 目标状态（出 8 后手牌已移除该 8）。
 */
export declare function aiBestSuit(state: Crazy8State): number;
/**
 * AI 完整回合（对任一方通用，可脚本重放）：无牌可出先摸牌，摸到可出
 * 则打出；有牌可出时优先出非 8 的牌（8 留到没得出），按手中最多花色
 * 保持灵活性，seed 噪声打破并列。
 * @param state - 目标状态。
 */
export declare function aiTakeTurn(state: Crazy8State): void;
/**
 * 进入下一局（先手在两家间交替）；整场已分胜负时忽略。
 * @param state - 目标状态。
 */
export declare function nextRound(state: Crazy8State): void;
/**
 * 整场积分（onScore 上报值）：每赢一局 100 分，先拿下 3 局 2 胜另加
 * 50 分。
 * @param state - 目标状态。
 */
export declare function matchScore(state: Crazy8State): number;
/**
 * 状态快照（排除 rng 闭包），供重放对比测试。
 * @param state - 目标状态。
 * @returns 可 toEqual 比较的纯数据对象。
 */
export declare function snapshot(state: Crazy8State): Record<string, unknown>;
