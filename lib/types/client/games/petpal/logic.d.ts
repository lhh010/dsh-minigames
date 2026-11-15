/**
 * 电子宠物 PetPal 的纯逻辑内核：加速时钟、四维属性衰减、生病/死亡
 * 状态机、生长阶段与进化判定、喂食/玩耍/清洁/睡觉交互、seed 个性，
 * 以及 localStorage 存档的序列化往返。全部随机经状态内的 mulberry32
 * 寄存器推进，相同 seed + 相同操作序列 = 完全相同的状态（可重放）。
 *
 * 时间约定：1 现实秒 = 1 游戏分钟，1 游戏日 = 24 现实秒；离线期间
 * 不结算属性（读档后从离开时的状态继续）。
 */
/** 1 游戏日对应的现实秒数（24 游戏分钟）。 */
export declare const DAY_SECONDS = 24;
/** 蛋孵化所需现实秒。 */
export declare const EGG_SECONDS = 30;
/** 蛋壳最多可点击加速的次数。 */
export declare const EGG_TAP_MAX = 10;
/** 每次点击蛋壳减少的孵化秒数。 */
export declare const EGG_TAP_BONUS = 3;
/** 生病次数上限：达到即离世。 */
export declare const SICK_LIMIT = 3;
/** 生病后该属性回升到的保底值（避免同一 tick 反复触发）。 */
export declare const SICK_RESCUE = 25;
/** 一觉的最长现实秒（到时自动醒来）。 */
export declare const SLEEP_SECONDS = 10;
/** 睡眠时精力回复速率（点/现实秒）。 */
export declare const SLEEP_ENERGY_RATE = 4;
/** 玩耍小游戏时长（现实秒）。 */
export declare const PLAY_SECONDS = 15;
/** 清醒时每隔多少秒生成一个污垢点。 */
export declare const DIRT_PERIOD = 18;
/** 身上污垢点上限。 */
export declare const DIRT_MAX = 5;
/** 心情 > 80 且饱食 > 60 时的生长加速倍率。 */
export declare const GROWTH_BOOST = 1.5;
/** 四维属性每秒衰减速率（清醒时；睡眠时冻结）。 */
export declare const STAT_DECAY: {
    readonly hunger: 0.8;
    readonly joy: 0.6;
    readonly clean: 0.25;
    readonly energy: 0.15;
};
/** 生长阶段（累计生长日数阈值：baby 0 / child 1 / teen 3 / adult 6）。 */
export type StageId = 'egg' | 'baby' | 'child' | 'teen' | 'adult';
/** 成年形态的 4 种进化分支。 */
export type AdultForm = 'dragon' | 'cat' | 'robot' | 'slime';
/** 三种食物。 */
export declare const FOOD_IDS: readonly ["meal", "snack", "feast"];
export type FoodId = (typeof FOOD_IDS)[number];
/** 食物的中文名。 */
export declare const FOOD_NAMES: Record<FoodId, string>;
/** 怪癖集合。 */
export declare const QUIRK_IDS: readonly ["nightOwl", "glutton", "sleepyhead", "playful"];
export type QuirkId = (typeof QUIRK_IDS)[number];
/** 怪癖的中文名。 */
export declare const QUIRK_NAMES: Record<QuirkId, string>;
/** 成年形态的中文名。 */
export declare const FORM_NAMES: Record<AdultForm, string>;
/** 四维属性（0-100，上限 100）。 */
export interface PetStats {
    hunger: number;
    joy: number;
    clean: number;
    energy: number;
}
/** 一种食物的效果定义：正值在偏好命中时乘以 1.5，负值不乘。 */
export interface FoodDef {
    hunger: number;
    joy: number;
    clean: number;
    energy: number;
    cooldown: number;
}
/** 食物效果表。 */
export declare const FOOD_DEFS: Record<FoodId, FoodDef>;
/** 进行中的追逐光点小游戏（坐标为场地内归一化 0-1）。 */
export interface PlaySession {
    tLeft: number;
    catches: number;
    dotX: number;
    dotY: number;
    targetX: number;
    targetY: number;
}
/** 宠物完整状态（可序列化字段全部进存档）。 */
export interface PetState {
    /** 个性种子。 */
    seed: number;
    /** mulberry32 寄存器（推进即消耗随机数，可序列化保确定性）。 */
    rngState: number;
    stats: PetStats;
    /** 累计现实秒（= 累计游戏分钟）。 */
    clockSec: number;
    /** 剩余孵化秒；> 0 表示仍在蛋中。 */
    eggLeftSec: number;
    /** 已点击蛋壳次数。 */
    eggClicks: number;
    /** 累计生病次数。 */
    sickCount: number;
    /** 离世后 tick 与交互全部冻结。 */
    dead: boolean;
    sleeping: boolean;
    /** 本次睡眠已进行的秒数。 */
    sleepSec: number;
    /** 身上污垢点数。 */
    dirtCount: number;
    /** 生成下一个污垢点的计时器。 */
    dirtTimer: number;
    /** 累计生长日数（心情 > 80 且饱食 > 60 时加速 1.5 倍）。 */
    stageDays: number;
    /** 四维时间加权和（careSum / careTime = careScore）。 */
    careSum: number;
    /** 参与照料评分累计的现实秒。 */
    careTime: number;
    /** 进入成年时锁定的进化形态。 */
    form: AdultForm | null;
    /** 进行中的玩耍小游戏；null 表示未在玩耍。 */
    play: PlaySession | null;
    /** 各食物剩余冷却秒。 */
    cooldowns: Record<FoodId, number>;
}
/** mulberry32 的独立流形式（供纯函数按 seed 取样个性）。 */
export declare function mulberry32(seed: number): () => number;
/** 推进状态内的随机寄存器并返回 0-1 均匀随机数。 */
export declare function nextRandom(state: PetState): number;
/** 按 seed 确定偏好食物（稳定、与状态内的随机流无关）。 */
export declare function favoriteFoodOf(seed: number): FoodId;
/** 按 seed 确定怪癖（稳定、与状态内的随机流无关）。 */
export declare function quirkOf(seed: number): QuirkId;
/** 当前游戏时刻（0-23 的游戏小时；1 现实秒 = 1 游戏小时）。 */
export declare function gameHour(state: PetState): number;
/** 该游戏小时是否属于夜晚（20:00-06:00）。 */
export declare function isNightHour(hour: number): boolean;
/** 创建一只新宠物（从蛋开始）。 */
export declare function createPet(seed: number): PetState;
/** 当前生长阶段（由剩余孵化秒与累计生长日数推导，无独立状态）。 */
export declare function stageOf(state: PetState): StageId;
/** 照料评分：四维均值对时间积分的时间加权平均（无记录时满分 100）。 */
export declare function careScore(state: PetState): number;
/** 照料评分 → 成年进化形态（边界 80/60/40，左闭区间取高档）。 */
export declare function adultFormFor(score: number): AdultForm;
/**
 * 推进一帧模拟。dt 为现实秒（调用方保证为小步长；帧调度器已钳制）。
 * 死亡后为空操作；蛋期只走孵化倒计时；睡眠只回精力并冻结其余三维；
 * 清醒时四维衰减 + 生长/照料积分 + 污垢生成，单帧至多触发一次生病。
 */
export declare function tickPet(state: PetState, dtSec: number): void;
/** 点击蛋壳加速孵化：每击 -3 秒，最多 10 次；非蛋期返回 false。 */
export declare function tapEgg(state: PetState): boolean;
/**
 * 喂食。蛋期/睡眠/死亡/冷却中失败返回 false；偏好食物正值效果 ×1.5，
 * 贪吃鬼吃饲料额外 +6 饱食；所有属性钳制到 [0, 100]。
 */
export declare function feedPet(state: PetState, food: FoodId): boolean;
/** 抚摸：+2 心情（蛋期/死亡不可抚摸）。 */
export declare function petPet(state: PetState): boolean;
/** 开始追逐光点小游戏（蛋期/睡眠/死亡/已在玩时失败）。 */
export declare function startPlay(state: PetState): boolean;
/**
 * 尝试点击光点：归一化场地坐标落在光点半径（0.06）内则捕获成功，
 * +25 心情（淘气包额外 +10）并以状态随机流重刷光点位置。
 */
export declare function catchDot(state: PetState, x: number, y: number): boolean;
/** 刷洗：清掉一个污垢点 +12 清洁；无污垢或不可交互时返回 false。 */
export declare function brushPet(state: PetState): boolean;
/** 哄睡（关灯 10 秒快速回精力）；蛋期/已睡/死亡失败。 */
export declare function startSleep(state: PetState): boolean;
/** 叫醒：提前结束睡眠，已回的精力保留。 */
export declare function wakePet(state: PetState): boolean;
/** 存档版本号（读档时校验，不匹配拒绝）。 */
export declare const SAVE_VERSION = 1;
/** localStorage 键。 */
export declare const SAVE_KEY = "dsh-minigames:petpal";
/** 序列化为可持久化 JSON 字符串。 */
export declare function serializePet(state: PetState): string;
/**
 * 反序列化：解析并校验存档，成功返回完整状态（play 重置为 null），
 * 坏 JSON / 版本不符 / 字段非法返回 null（调用方回落到新宠物）。
 */
export declare function deserializePet(json: string): PetState | null;
