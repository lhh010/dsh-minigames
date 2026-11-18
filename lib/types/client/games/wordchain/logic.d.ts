/**
 * 词语接龙 WordChain 纯逻辑：内置 300+ 常见双字/三字词库（按类别分组，
 * 每词带首尾字无声调拼音），玩家与 AI 轮流接龙——新词首字须与上词尾字
 * 同音（同字为正接另加奖励）；玩家开局领 5 张手牌且不随回合刷新（死局
 * 重起时双方换牌），可出牌或跳过（跳过送 AI 5 分）；AI 从词库按 seed
 * 策略出词（70% 找到接龙否则跳过）；双方连续跳过即死局，重新起头并
 * 换牌；10 回合高分挑战。全部随机走注入 seed（mulberry32），任何种子
 * 下的整局都可以确定性重放。
 */
/** 单条词语词条：词本体，以及首字/尾字的无声调拼音（同音判定用）。 */
export interface WordEntry {
    /** 双字或三字词本体。 */
    word: string;
    /** 首字无声调拼音。 */
    headPy: string;
    /** 尾字无声调拼音。 */
    tailPy: string;
}
/** 词库分组来源（按类别组织，便于丰富度查阅；游戏只用展平后的 WORDS）。 */
export interface WordGroup {
    /** 类别名（自然/食物/动作/物品……）。 */
    category: string;
    /** 该类别下的词条。 */
    words: WordEntry[];
}
/** 按类别分组的词库来源（合计 300+ 词）。 */
export declare const WORD_GROUPS: readonly WordGroup[];
/** 展平后的完整词库（发牌与 AI 取词都在这里进行）。 */
export declare const WORDS: readonly WordEntry[];
/** 总回合数（每回合 = 玩家一动 + AI 一动）。 */
export declare const ROUNDS = 10;
/** 手牌候选数量（整局的全部弹药，不随回合刷新）。 */
export declare const HAND_SIZE = 5;
/** 玩家跳过时 AI 得到的分数。 */
export declare const SKIP_GIFT = 5;
/** AI 找到接龙的概率（其余情况跳过）。 */
export declare const AI_PLAY_RATE = 0.7;
/** 接出基础分。 */
export declare const BASE_GAIN = 10;
/** 链长加成：链上每多一词（每 +1 链）加的分。 */
export declare const CHAIN_STEP = 2;
/** 同音（不同字）接龙的奖励分。 */
export declare const HOMOPHONE_BONUS = 5;
/** 首字与尾字完全相同（非同音）的奖励分。 */
export declare const EXACT_BONUS = 5;
/** 同字接在同字奖励之外「额外」的加成（合计比同音高 5）。 */
export declare const EXACT_EXTRA_BONUS = 5;
/** 接龙判定结果：exact 同字正接 / homophone 同音不同字 / null 不可接。 */
export type LinkKind = 'exact' | 'homophone';
/** mulberry32 确定性随机数发生器。 */
export declare function mulberry32(seed: number): () => number;
/**
 * 接龙判定：上一词尾字与下一词首字同字为 exact，同音不同字为
 * homophone，否则不可接。
 * @param prev - 链上上一词。
 * @param next - 待接的词。
 * @returns 接法，或 null 表示接不上。
 */
export declare function linkKind(prev: WordEntry, next: WordEntry): LinkKind | null;
/**
 * 接龙得分：基础 10 + 链长加成（每 +1 链 +2）；同音接 +5；首字完全相同
 * （非同音）+5 且额外 +5（合计 +10）。
 * @param kind - 接法。
 * @param chainPos - 新词在链中的位置（链首为 1）。
 * @returns 精确得分。
 */
export declare function gainFor(kind: LinkKind, chainPos: number): number;
/** AI 的一步棋描述（渲染层做动画与提示用）。 */
export interface AiMove {
    type: 'play' | 'skip';
    /** 出词时的词条（type 为 play 时有效）。 */
    entry?: WordEntry;
    /** 出词时的接法。 */
    kind?: LinkKind;
    /** 本次得分。 */
    gain: number;
}
/** 一局 match 的全部可变状态（rng 注入，纯数据可重放）。 */
export interface MatchState {
    /** 当前回合（1..ROUNDS）。 */
    round: number;
    /** playing 进行中 / over 十回合结束。 */
    phase: 'playing' | 'over';
    /** 当前链条（chain[0] 为起头词）。 */
    chain: WordEntry[];
    /** 玩家手牌（出掉即移除，只有死局重起才换牌）。 */
    hand: WordEntry[];
    /** 已用过的词（不得重复出）。 */
    used: Set<string>;
    playerScore: number;
    aiScore: number;
    /** 双方连续跳过计数（≥2 触发死局重起并换牌）。 */
    consecutiveSkips: number;
    /** 死局重起次数。 */
    restarts: number;
    /** AI 最近一步（渲染层展示）。 */
    aiLastMove: AiMove | null;
    /** 注入的随机流。 */
    rng: () => number;
}
/** 链条尾部的词（链为空时取库里第一条，仅类型兜底）。 */
export declare function chainTail(state: MatchState): WordEntry;
/** 手牌中可接当前链尾的下标列表。 */
export declare function playableIndices(state: MatchState): number[];
/**
 * 发 5 张手牌（确定性）：对未用词下标做局部 Fisher–Yates 洗牌取前 5
 * 张；若洗出的 5 张全部接不上且库中还有可接的未用词，则随机换入一张
 * 可接的，保证玩家绝大多数回合有牌可出。全程有界，任何 rng 都不会死
 * 循环。
 * @param state - 比赛状态（就地更新 hand）。
 */
export declare function dealHand(state: MatchState): void;
/** 死局重起：从未用词里随机挑一条做新链首，并给双方换一手牌。 */
export declare function restartChain(state: MatchState): void;
/**
 * AI 一步（确定性）：收集可接的未用词，rng < AI_PLAY_RATE 时按 rng 挑一
 * 条接上，否则跳过。
 * @param state - 比赛状态（就地更新链与分数）。
 * @returns 这一步的描述。
 */
export declare function aiTurn(state: MatchState): AiMove;
/**
 * 玩家从手牌出词接龙（出掉的牌移出手牌，其余保留）。
 * @param state - 比赛状态。
 * @param handIndex - 手牌下标（0..4）。
 * @returns ok 是否成功，gain 得分，kind 接法。
 */
export declare function playerPlay(state: MatchState, handIndex: number): {
    ok: boolean;
    gain: number;
    kind: LinkKind | null;
};
/**
 * 玩家跳过：AI 得 SKIP_GIFT 分，随后 AI 行动（双方连跳触发死局重起换
 * 牌）。
 * @param state - 比赛状态。
 * @returns AI 这一步的描述。
 */
export declare function playerSkip(state: MatchState): AiMove;
/**
 * 建立一场 match：起头一条链、发 5 张手牌（全部由 seed 决定）。
 * @param seed - 种子（同一 seed 得到完全相同的局面与走向）。
 * @returns 初始比赛状态。
 */
export declare function createMatch(seed: number): MatchState;
/** 重放对比快照：与随机无关的可比较纯数据（测试确定性用）。 */
export declare function snapshot(state: MatchState): {
    round: number;
    phase: string;
    chain: string[];
    hand: string[];
    playerScore: number;
    aiScore: number;
    restarts: number;
};
/** 记录下来的玩家动作（序列化重放用）。 */
export interface RecordedAction {
    type: 'play' | 'skip';
    /** type 为 play 时的手牌下标。 */
    handIndex?: number;
}
/**
 * 按记录的动作序列重放整局：AI、发牌、死局全部由同一 seed 推导，动作
 * 相同则每个快照都相同。
 * @param seed - 比赛种子。
 * @param actions - 玩家动作序列。
 * @returns 每步之后的快照序列。
 */
export declare function replayMatch(seed: number, actions: readonly RecordedAction[]): Array<ReturnType<typeof snapshot>>;
/**
 * 确定性整局脚本（测试重放用）：每回合一律出第一张可接的手牌，无牌可
 * 接则跳过，直到终局或动作数用尽。
 * @param seed - 比赛种子。
 * @param maxTurns - 最多执行的玩家回合数（防死循环）。
 * @returns 记录的动作序列与每步之后的快照序列。
 */
export declare function playSkipScript(seed: number, maxTurns: number): {
    actions: RecordedAction[];
    snapshots: Array<ReturnType<typeof snapshot>>;
};
/** 终局判定：玩家胜 / AI 胜 / 平局；未结束时为 null。 */
export declare function finalResult(state: MatchState): 'player' | 'ai' | 'draw' | null;
