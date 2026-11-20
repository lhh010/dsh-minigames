/**
 * 疾速集合 SET 纯逻辑：81 张牌（颜色×形状×数量×填充，各 3 值）构成完整
 * 牌堆；三张牌在每个属性上「全同或全不同」即为一个集合。桌面保持 12 张，
 * 无集合时自动补 3 张（上限 15），牌堆取尽且桌面无集合即终局。限时模式
 * 3 分钟起步、逐关收紧（180s→120s），答错扣 3 秒；练习模式不限时。开局
 * 30 秒教学：一个可用集合闪边提示。所有随机走注入 seed（mulberry32），
 * 同一 seed 重放完全一致——逻辑层无 DOM、无定时器，时间由调用方以 dt 推进。
 */
/** 每个属性的取值数（3 值）。 */
export declare const VALUES_PER_ATTR = 3;
/** 属性数（颜色/形状/数量/填充）。 */
export declare const ATTR_COUNT = 4;
/** 完整牌堆张数：3^4 = 81。 */
export declare const CARD_COUNT: number;
/** 桌面标准张数。 */
export declare const TABLE_MIN = 12;
/** 桌面上限（自动补牌后）。 */
export declare const TABLE_MAX = 15;
/** 判错扣时（毫秒）。 */
export declare const WRONG_PENALTY_MS = 3000;
/** 教学提示时长（毫秒）：开局 30 秒内闪边一个可用集合。 */
export declare const TUTOR_MS = 30000;
/** 收下一个集合的基础分。 */
export declare const BASE_SET_SCORE = 100;
/** 速度加成上限：距上一个集合每过 1 秒衰减 20 分（最低 0）。 */
export declare const SPEED_BONUS_MAX = 100;
export declare const SPEED_BONUS_DECAY_PER_S = 20;
/** 第 1 关限时（毫秒）。 */
export declare const LEVEL_START_MS = 180000;
/** 每升一关收紧的毫秒数。 */
export declare const LEVEL_STEP_MS = 15000;
/** 限时下限（毫秒）。 */
export declare const LEVEL_MIN_MS = 120000;
export type SetPhase = 'playing' | 'over';
export interface SetGameState {
    phase: SetPhase;
    /** 当前关卡（1 基）：目标集合数递增、计时收紧。 */
    level: number;
    /** 练习模式：不限时，时间不递减。 */
    practice: boolean;
    /** 牌堆剩余（发牌顺序，队首先出）。 */
    deck: number[];
    /** 桌面牌（按槽位顺序）。 */
    table: number[];
    /** 已选牌的桌面下标（选择顺序，凑满 3 张自动判定）。 */
    selected: number[];
    score: number;
    /** 全局已得集合数。 */
    setsFound: number;
    /** 本关已得集合数。 */
    levelSets: number;
    /** 剩余时间（毫秒）；练习模式不递减。 */
    timeLeftMs: number;
    /** 开局以来累计流逝（毫秒）：驱动教学窗口与速度加成。 */
    elapsedMs: number;
    /** 上次得集合时的 elapsedMs（速度加成基准）。 */
    lastSetElapsedMs: number;
    /** 教学窗口内用过闪边提示集合。 */
    hintUsed: boolean;
    rng: () => number;
}
/**
 * mulberry32 确定性随机：同一 seed 生成同一序列。
 * @param seed - 32 位无符号整数种子。
 * @returns 返回 [0, 1) 随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/**
 * 由四属性编码牌号：color*27 + shape*9 + count*3 + fill。
 * @param color - 颜色 0-2（红/绿/紫）。
 * @param shape - 形状 0-2（菱/椭圆/波浪）。
 * @param count - 数量 0-2（1/2/3 个）。
 * @param fill - 填充 0-2（实/空/条纹）。
 * @returns 牌号 0-80。
 */
export declare function cardAt(color: number, shape: number, count: number, fill: number): number;
/** 牌的颜色值 0-2。 */
export declare function colorOf(card: number): number;
/** 牌的形状值 0-2。 */
export declare function shapeOf(card: number): number;
/** 牌的数量值 0-2。 */
export declare function countOf(card: number): number;
/** 牌的填充值 0-2。 */
export declare function fillOf(card: number): number;
/**
 * 完整 81 张牌（0-80 顺序枚举）。
 * @returns 牌号数组（新数组，可安全洗牌/裁剪）。
 */
export declare function fullDeck(): number[];
/**
 * 洗牌（Fisher–Yates，消耗注入 rng）。
 * @param rng - [0,1) 随机源。
 * @returns 洗好的 81 张牌堆。
 */
export declare function shuffledDeck(rng: () => number): number[];
/**
 * 集合判定：三张牌在每个属性上要么全同、要么全不同（等价于每属性三值
 * 之和能被 3 整除）。
 * @param a - 牌号。
 * @param b - 牌号。
 * @param c - 牌号。
 * @returns 是否构成一个集合。
 */
export declare function isSet(a: number, b: number, c: number): boolean;
/**
 * 在桌面牌中找一个集合（按槽位下标三元组升序返回首个命中）。
 * @param cards - 桌面牌数组。
 * @returns [i, j, k] 或 null（无集合）。
 */
export declare function findSet(cards: number[]): [number, number, number] | null;
/**
 * 第 level 关的限时：180s 起步，每关收紧 15s，下限 120s。
 * @param level - 1 基关卡号。
 * @returns 该关限时（毫秒）。
 */
export declare function levelTimeMs(level: number): number;
/**
 * 第 level 关的目标集合数：6 起步，每关 +2。
 * @param level - 1 基关卡号。
 * @returns 该关需要收下的集合数。
 */
export declare function targetSets(level: number): number;
/**
 * 建立初始状态：洗牌、发 12 张并保证桌面可玩（必要时补 3）。
 * @param rng - 注入的 [0,1) 随机源（测试请注入 mulberry32）。
 * @param practice - 练习模式（不限时）。
 * @returns 就绪的 SetGameState（phase 为 'playing'）。
 */
export declare function createSetGameState(rng?: () => number, practice?: boolean): SetGameState;
/**
 * 维持桌面可玩：先补足 12 张；桌面无集合且牌堆有牌时每次补 3 张（上限
 * 15）；牌堆取尽且桌面无集合则终局。
 * @param state - 当前状态。
 */
export declare function ensurePlayable(state: SetGameState): void;
/**
 * 教学窗口是否开启（开局 TUTOR_MS 内且仍在进行）。
 * @param state - 当前状态。
 */
export declare function tutorActive(state: SetGameState): boolean;
/**
 * 教学提示集合：窗口内返回桌面上首个可用集合的槽位下标三元组。
 * @param state - 当前状态。
 * @returns [i, j, k] 或 null（窗口外 / 桌面暂无集合）。
 */
export declare function tutorSet(state: SetGameState): [number, number, number] | null;
/**
 * 点选一张桌面牌：已选则取消，未选则加入；凑满 3 张自动判定并清空选择。
 * @param state - 当前状态（须处于 'playing'）。
 * @param index - 桌面槽位下标。
 * @returns 'ignored' 非进行中或下标越界；'selected' 已加入选择；
 *   'deselected' 已取消选择；'set' 判定成功；'wrong' 判定失败（已扣时）。
 */
export declare function selectCard(state: SetGameState, index: number): 'ignored' | 'selected' | 'deselected' | 'set' | 'wrong';
/**
 * 推进时间：累计 elapsed、限时模式递减 timeLeft，耗尽即终局。
 * @param state - 当前状态。
 * @param dtMs - 本帧流逝的毫秒数（非负）。
 * @returns 'ok' 继续；'over' 时间耗尽终局。
 */
export declare function tick(state: SetGameState, dtMs: number): 'ok' | 'over';
/**
 * 重放一致性辅助：按 seed 重建并对桌面首个集合连续收割 n 次，返回过程
 * 摘要（得分 / 全局集合数 / 关卡 / 桌面与牌堆快照），用于双局比对。
 * @param seed - 种子。
 * @param steps - 收割次数。
 * @param practice - 练习模式。
 * @returns 摘要对象。
 */
export declare function harvestReplay(seed: number, steps: number, practice?: boolean): {
    score: number;
    setsFound: number;
    level: number;
    table: number[];
    deck: number[];
};
