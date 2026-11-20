/**
 * 迷你爬塔 TowerCard 纯逻辑：三层循环（战斗→奖励→下一层，共 10 层，第
 * 5/10 层 boss）。回合制卡牌战斗——每回合 3 能量、手牌 5 张，攻击/格挡/
 * 特殊（连击、抽牌、能量、虚弱）四类牌；敌人按固定/交替/蓄力三段模式机
 * 行动，蓄力回合 telegraph 警示。所有随机经注入 seed（mulberry32）驱动，
 * 同一 seed 整塔重放逐位确定。本文件无 DOM、无计时器，全部函数直接改写
 * state 或返回纯值，供测试与渲染共用。
 */
/** 牌种类别。 */
export type CardKind = 'attack' | 'block' | 'combo' | 'draw' | 'energy' | 'weaken';
/** 一张牌：attack/block 携带数值，特殊牌效果固定。 */
export interface Card {
    id: number;
    kind: CardKind;
    /** 攻击伤害或格挡量；其余类别为 0。 */
    value: number;
}
/** 敌人攻击模式：fixed 每回合平砍，alternate 攻/防交替，charge 蓄力后重击。 */
export type EnemyPattern = 'fixed' | 'alternate' | 'charge';
/** 一名敌人。 */
export interface Enemy {
    name: string;
    hp: number;
    maxHp: number;
    atk: number;
    pattern: EnemyPattern;
    block: number;
    /** 虚弱剩余回合数（>0 时该敌人造成伤害 -25%）。 */
    weakTurns: number;
    /** 蓄力中：本回合结束将释放重击。 */
    charging: boolean;
    /** 已行动回合数（alternate 判奇偶用）。 */
    turnIndex: number;
    dead: boolean;
}
/** 奖励选项：加牌 / 治疗 / 删牌。 */
export type RewardKind = 'add' | 'heal' | 'remove';
/** 一项奖励。 */
export interface RewardOption {
    kind: RewardKind;
    /** add：拟加入的牌；heal：回复量；remove：无附加数据。 */
    card?: Card;
    heal: number;
    /** 展示文案。 */
    label: string;
}
/** 塔的阶段。 */
export type TowerPhase = 'battle' | 'reward' | 'dead' | 'won';
/** 玩家侧运行时数值。 */
export interface PlayerState {
    hp: number;
    maxHp: number;
    block: number;
    energy: number;
    energyMax: number;
}
/** 整塔状态（含 rng，供 seed 确定性延续到洗牌与奖励）。 */
export interface TowerState {
    rng: () => number;
    nextCardId: number;
    floor: number;
    phase: TowerPhase;
    player: PlayerState;
    /** 抽牌堆（末尾为顶）。 */
    deck: Card[];
    hand: Card[];
    discard: Card[];
    enemies: Enemy[];
    rewards: RewardOption[];
    /** 战斗内回合计数（含当前）。 */
    turn: number;
    message: string;
}
/** 顶部常量：初始血量 / 每回合能量 / 手牌数 / 起始牌组 / 总层数。 */
export declare const START_HP = 80;
export declare const ENERGY_PER_TURN = 3;
export declare const HAND_SIZE = 5;
export declare const START_DECK_SIZE = 12;
export declare const TOTAL_FLOORS = 10;
/** 胜利回血量。 */
export declare const VICTORY_HEAL = 6;
/** 虚弱减伤比例（乘 0.75 向下取整）。 */
export declare const WEAK_FACTOR = 0.75;
/**
 * mulberry32 确定性伪随机数发生器（注入 seed 用）。
 * @param seed - 非负整数种子。
 * @returns 返回 [0,1) 随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/** 特殊牌效果常量。 */
export declare const COMBO_HITS = 2;
export declare const COMBO_EACH = 5;
export declare const DRAW_COUNT = 2;
/** 各类牌的能量费用（energy 牌 0 费回 2 能量）。 */
export declare function cardCost(kind: CardKind): number;
/** 牌面名（渲染与日志共用）。 */
export declare function cardName(card: Card): string;
/**
 * 开创整塔（起始 12 张：4 攻 4 格 + 连击/抽牌/能量/虚弱 各 1）。
 * @param seed - 种子。
 * @returns 第 1 层战斗就绪的塔状态。
 */
export declare function createTower(seed: number): TowerState;
/**
 * 出牌合法性：战斗中、索引有效、能量足够。
 * @param state - 塔状态。
 * @param handIndex - 手牌下标。
 */
export declare function canPlayCard(state: TowerState, handIndex: number): boolean;
/**
 * 打出一张手牌。
 * @param state - 塔状态。
 * @param handIndex - 手牌下标。
 * @param targetIndex - 攻击目标敌人下标（无效则取首个存活敌人）。
 * @returns 是否成功打出（非法返回 false 且不改状态）。
 */
export declare function playCard(state: TowerState, handIndex: number, targetIndex?: number): boolean;
/**
 * 敌人下一步意图（渲染 telegraph 用）。
 * @returns attack 为常规伤害（已含虚弱折减），big 为蓄力重击，charge 为本回合蓄力，defend 为加格挡。
 */
export declare function enemyIntent(enemy: Enemy): {
    type: 'attack' | 'big' | 'charge' | 'defend';
    dmg: number;
};
/**
 * 结束回合：弃手牌 → 存活敌人依次行动 → 清玩家格挡 → 重抽手牌、回能量。
 * 全灭则进奖励层（第 10 层直接通关）；玩家血归零判负。
 */
export declare function endTurn(state: TowerState): void;
/**
 * 领取奖励并进入下一层。
 * @param state - 塔状态。
 * @param index - 奖励下标（越界忽略）。
 */
export declare function pickReward(state: TowerState, index: number): void;
/**
 * 计分：已清层数 x100，通顶额外 +500 与剩余血量。
 * @param state - 塔状态。
 */
export declare function scoreOf(state: TowerState): number;
/** 调试/测试用状态摘要：层数/阶段/血量/牌组尺寸。 */
export declare function snapshotOf(state: TowerState): string;
