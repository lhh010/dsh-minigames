/**
 * 21点（Blackjack）纯逻辑：6 副牌靴（312 张），mulberry32(seed, round)
 * 确定性洗牌，靴内剩余不足切牌点时下一局开局整靴重洗。标准规则：
 * A 就高计 1/11（不爆优先 11，可软可硬），J/Q/K 计 10；玩家回合
 * Hit / Stand / Double（仅首两张且余额足够）；天生 Blackjack 赔 3:2；
 * 庄家小于 17 必须要牌，软 17 按规则表选停（S17 默认停牌，H17 要牌）；
 * 对子可分一手为两手（分牌后的 21 点不算天生 Blackjack，分 A 各补一张
 * 即停）。下注档 25/50/100/250；结算后余额不足最低注时重新发放 500。
 *
 * 所有操作都直接修改传入的 state（发牌从 shoe 末尾弹出），同一 seed
 * 与同一操作序列必然得到同一状态，可脱离 DOM 直接模拟验证。
 */
/** 靴内副数。 */
export declare const DECK_COUNT = 6;
/** 切牌点：靴内剩余不足此数时，下一局开局整靴重洗。 */
export declare const CUT_CARD = 60;
/** 下注档（B 键循环切换）。 */
export declare const BET_STEPS: readonly number[];
/** 最低注（下注档最小值）。 */
export declare const MIN_BET: number;
/** 初始余额。 */
export declare const START_BANKROLL = 1000;
/** 破产重发金额（结算后余额不足最低注时补发）。 */
export declare const REBUY_AMOUNT = 500;
/** 最多同时手数（对子分牌一次，1 手 → 2 手）。 */
export declare const MAX_HANDS = 2;
/** 庄家软 17 规则表：S17 停牌，H17 要牌。 */
export type DealerRule = 'S17' | 'H17';
/** 一张牌：花色 0-3（♠♥♦♣）、点数 1-13（A..K）。 */
export interface Card {
    suit: number;
    rank: number;
}
/** 手牌点数：total 为就高不爆的总点，soft 表示含按 11 计的 A。 */
export interface HandValue {
    total: number;
    soft: boolean;
    busted: boolean;
}
/** 一手玩家牌及其注码与结算结果。 */
export interface Hand {
    cards: Card[];
    /** 本手注码（Double 后翻倍）。 */
    bet: number;
    doubled: boolean;
    /** 来自分牌（其 2 张 21 点不算天生 Blackjack）。 */
    fromSplit: boolean;
    stood: boolean;
    /** 结算结果；未结算为 null。 */
    outcome: HandOutcome | null;
    /** 结算返还金额（含本金；输为 0）；未结算为 0。 */
    payout: number;
}
/** 一手牌的结算分支。 */
export type HandOutcome = 'blackjack' | 'win' | 'push' | 'lose';
/** 牌局阶段：下注（含发牌前）/ 玩家回合 / 已结算。 */
export type GamePhase = 'betting' | 'player' | 'settled';
/** 一局游戏的完整可测状态。 */
export interface BlackjackState {
    seed: number;
    /** 规则表（庄家软 17 行为）。 */
    rule: DealerRule;
    /** 已开局数（含当前局；R 重开从 1 重新计）。 */
    round: number;
    bankroll: number;
    /** 当前选中的下注档索引（BET_STEPS 下标）。 */
    betStep: number;
    phase: GamePhase;
    /** 牌靴（发牌从末尾弹出）。 */
    shoe: Card[];
    /** 弃牌堆（整靴重洗时清空）。 */
    discard: Card[];
    /** 整靴重洗次数。 */
    reshuffles: number;
    /** 破产重发次数。 */
    rebuys: number;
    /** 玩家手（分牌后 2 手）。 */
    hands: Hand[];
    /** 当前操作手索引。 */
    active: number;
    dealer: Card[];
    /** 庄家暗牌是否尚未翻开。 */
    holeHidden: boolean;
    /** 最近一次操作的提示文案。 */
    message: string;
}
/**
 * mulberry32 确定性伪随机数发生器。
 * @param seed - 32 位种子。
 * @returns 返回 [0,1) 随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/** 构造一副洗好的 6 副牌靴（Fisher-Yates）。 */
export declare function makeShoe(seed: number, round: number): Card[];
/** 单张牌点值：J/Q/K 计 10，A 计 1（软硬由 handValue 决定）。 */
export declare function cardValue(rank: number): number;
/** 构造一张指定点数（花色默认黑桃）的牌，测试布鞋用。 */
export declare function makeCard(rank: number, suit?: number): Card;
/**
 * 手牌点数：A 先计 1，能不爆升为 11（就高不爆）；soft 表示仍有按
 * 11 计的 A。
 * @param cards - 手牌。
 * @returns total 总点、soft 是否软牌、busted 是否爆点。
 */
export declare function handValue(cards: Card[]): HandValue;
/**
 * 天生 Blackjack：首两张恰 21 点且非分牌手。
 * @param hand - 目标手。
 */
export declare function isNaturalBlackjack(hand: Hand): boolean;
/**
 * 庄家规则表：总点 <17 必须要牌；恰软 17 时 S17 停、H17 要。
 * @param dealer - 庄家手牌。
 * @param rule - 规则表。
 */
export declare function dealerMustHit(dealer: Card[], rule: DealerRule): boolean;
/**
 * 开新局：round 0、余额 1000、按 (seed, 0) 洗整靴。
 * @param seed - 基础种子。
 * @param rule - 庄家软 17 规则表，默认 S17。
 */
export declare function createBlackjack(seed: number, rule?: DealerRule): BlackjackState;
/**
 * 循环切换下注档（B 键）。
 * @returns 切换后的下注档索引。
 */
export declare function cycleBetStep(state: BlackjackState): number;
/**
 * 发牌开局：扣注、（必要时）重洗、按 玩家-庄家-玩家-庄家 发四张；
 * 玩家天生 Blackjack 时立即开庄结算。
 * @returns 余额不足（发牌失败）为 false。
 */
export declare function dealRound(state: BlackjackState): boolean;
/** 当前操作手；越界（结算后）返回 null。 */
export declare function activeHand(state: BlackjackState): Hand | null;
/**
 * 要牌：向当前手发一张；爆点或恰 21 点自动定案并推进。
 * @returns 非 player 阶段为 false。
 */
export declare function playerHit(state: BlackjackState): boolean;
/**
 * 停牌：当前手定案并推进。
 * @returns 非 player 阶段为 false。
 */
export declare function playerStand(state: BlackjackState): boolean;
/**
 * 加倍：仅首两张且余额足够；注翻倍、恰发一张、随即定案推进。
 * @returns 条件不满足为 false。
 */
export declare function playerDouble(state: BlackjackState): boolean;
/**
 * 分牌：当前手首两张点值相同且手数未满且余额足够，拆为两手各补一张；
 * 分 A 各补一张即自动停牌。
 * @returns 条件不满足为 false。
 */
export declare function playerSplit(state: BlackjackState): boolean;
/**
 * 开庄结算：翻开暗牌；玩家全爆时庄家不再要牌，否则按规则表要牌；
 * 逐手按 爆/BJ/庄BJ/比点 结算并入账；余额不足最低注则重发 500。
 */
export declare function finishRound(state: BlackjackState): void;
