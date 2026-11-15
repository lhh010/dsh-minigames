/**
 * 鱼塘物语纯逻辑：钓鱼双段判定状态机（力度条锁定 → 浮漂等咬钩 → 提竿时机）、
 * 六品种生长（鱼苗→成鱼 3 阶段按游戏日推进、每日喂食 1 次、连饿 2 天停滞）、
 * RGB 三通道颜色基因（子代逐通道随机取双亲之一 ±小变异并钳制 0-9）、同品种
 * 一公一母成鱼相邻自动繁殖（冷却 2 日、产 1-2 鱼苗入空格）、每日正弦 + seed
 * 噪声的品种独立行情曲线、鱼苗/鱼粮/扩塘商店与 5 关目标（L1 赚 300 → L5 集齐
 * 6 品种并赚 3000）。全部为确定性纯函数：随机走注入 seed 的 mulberry32（市场
 * 噪声走不消耗序列的整数散列），无 DOM、无计时器。
 */
/** 品种 id。 */
export type SpeciesId = 'crucian' | 'guppy' | 'carp' | 'betta' | 'koi' | 'arowana';
/** 鱼的稀有度：决定钓取池分层。 */
export type Tier = 'common' | 'rare' | 'legendary';
/** 一个品种的经济与生长参数。 */
export interface SpeciesSpec {
    /** 中文名。 */
    name: string;
    /** 成鱼基准卖价（行情 ×1、颜色 ×1 时）。 */
    base: number;
    /** 鱼苗喂到成鱼所需的天数（每天喂 1 次）。 */
    growDays: number;
    /** 渲染主色（尾鳍/点缀）。 */
    color: string;
    /** 钓取稀有度分层。 */
    tier: Tier;
}
/** 六个品种：前 3 种商店有鱼苗、钓取常见；斗鱼/锦鲤稀有；龙鱼传说。 */
export declare const SPECIES: Record<SpeciesId, SpeciesSpec>;
/** 图鉴/行情/商店的固定展示顺序。 */
export declare const SPECIES_ORDER: SpeciesId[];
/** 一关的目标。 */
export interface FishpondLevel {
    /** 目标金币（金币 ≥ 此值即满足金额条件）。 */
    target: number;
    /** 是否额外要求集齐 6 品种。 */
    needAllSpecies: boolean;
    /** 目标文案（渲染层直接展示）。 */
    label: string;
}
/** 5 关递进：金额目标上涨，终关要求全图鉴。 */
export declare const LEVELS: FishpondLevel[];
/** 颜色基因：RGB 三通道各 0-9。 */
export type Genes = [number, number, number];
/** 性别。 */
export type Sex = 'M' | 'F';
/** 一关的初始金币。 */
export declare const START_COINS = 120;
/** 初始鱼粮数。 */
export declare const START_FOOD = 4;
/** 体力上限。 */
export declare const MAX_ENERGY = 5;
/** 每个游戏日回复的体力。 */
export declare const ENERGY_PER_DAY = 2;
/** 初始塘格数。 */
export declare const BASE_SLOTS = 6;
/** 扩塘后的最大格数（3×3）。 */
export declare const MAX_SLOTS = 9;
/** 扩塘各阶段花费（第 7/8/9 格）。 */
export declare const EXPAND_COSTS: number[];
/** 一份鱼粮的价格与数量。 */
export declare const FOOD_COST = 6;
export declare const FOOD_PER_BUY = 3;
/** 繁殖冷却天数。 */
export declare const BREED_COOLDOWN_DAYS = 2;
/** 单基因通道变异概率。 */
export declare const MUTATE_CHANCE = 0.18;
/** 力度条全程（0→1）扫描秒数。 */
export declare const POWER_PERIOD_S = 0.85;
/** 力度甜区（含端点）：锁定在此区间才抛竿成功。 */
export declare const POWER_LO = 0.62;
export declare const POWER_HI = 0.92;
/** 甜区中心与半宽：力度质量 = 1 - |p - 中心| / 半宽。 */
export declare const POWER_CENTER = 0.77;
export declare const POWER_HALF = 0.15;
/** 咬钩时刻区间：抛竿后 [BITE_MIN_S, BITE_MIN_S + BITE_SPAN_S) 秒。 */
export declare const BITE_MIN_S = 1;
export declare const BITE_SPAN_S = 2;
/** 错过咬钩后浮漂停留的宽限倍数：超过 biteAt + 半窗 ×3 自动脱钩。 */
export declare const ESCAPE_GRACE = 3;
/** 市场正弦周期（游戏日）。 */
export declare const PRICE_PERIOD = 7;
/** 市场正弦幅度（±30%）。 */
export declare const PRICE_SWING = 0.3;
/** 市场 seed 噪声幅度（±18%）。 */
export declare const PRICE_NOISE = 0.18;
/** 行情倍率上下限。 */
export declare const MULT_MIN = 0.6;
export declare const MULT_MAX = 1.6;
/** 一条塘中鱼。 */
export interface PondFish {
    /** 全局唯一 id（渲染游动相位、繁殖去重用）。 */
    id: number;
    species: SpeciesId;
    sex: Sex;
    genes: Genes;
    /** 累计被喂食的天数（驱动大小阶段）。 */
    growthDays: number;
    /** 连续未喂食天数（≥2 停滞生长并冒饥饿气泡）。 */
    hungryDays: number;
    /** 今天是否已喂（每天每鱼最多 1 次）。 */
    fedToday: boolean;
    /** 上次繁殖的游戏日（-1 = 从未，不受冷却限制）。 */
    lastBredDay: number;
    /** 所在塘格下标。 */
    slot: number;
}
/** 钓鱼状态机：idle → power → wait → result →（确认后）idle。 */
export interface FishingState {
    status: 'idle' | 'power' | 'wait' | 'result';
    /** 力度条当前位置 0..1（ping-pong 往复）。 */
    power: number;
    /** 力度条方向。 */
    powerDir: 1 | -1;
    /** 力度判定质量 0..1（影响稀有权重）。 */
    quality: number;
    /** 抛竿后第几秒咬钩（进入 wait 时由 rng 排定）。 */
    biteAt: number;
    /** 进入 wait 以来流逝的秒数。 */
    elapsed: number;
    /** 咬钩判定半窗（秒）：随关卡收窄。 */
    halfWindow: number;
    /** result 状态下钓到的鱼（尚未入塘）。 */
    pending: PondFish | null;
    /** result 状态下的失败原因（成功为空串）。 */
    failReason: '' | 'power' | 'early' | 'late' | 'escape';
}
/** 一局状态。 */
export interface FishpondState {
    phase: 'playing' | 'won';
    /** 0 起的关卡下标。 */
    levelIndex: number;
    /** 当前游戏日（1 起）。 */
    day: number;
    coins: number;
    energy: number;
    food: number;
    /** 当前塘格数（6-9）。 */
    pondSlots: number;
    /** 按行优先排列的塘格（空格为 null）。 */
    pond: (PondFish | null)[];
    /** 图鉴：是否曾经拥有过该品种（入塘即登记）。 */
    collected: Record<SpeciesId, boolean>;
    fishing: FishingState;
    /** 下一次繁殖/出售涉及的销售确认：塘格下标（-1 无）。 */
    pendingSell: number;
    /** 渲染提示文案（动作反馈）。 */
    message: string;
    /** 注入的种子（市场散列用）。 */
    seed: number;
    /** 下一条鱼的 id。 */
    nextFishId: number;
    rng: () => number;
}
/**
 * mulberry32 确定性伪随机数发生器（与 farm 同构造）。
 * @param seed - 32 位种子。
 * @returns 返回 [0,1) 随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/**
 * 某品种在第 day 天的行情倍率：1 ± 30% 正弦（品种独立相位）± 18% seed
 * 噪声（整数散列，不消耗 rng 序列），钳制在 [MULT_MIN, MULT_MAX]。
 * @param species - 品种 id。
 * @param day - 游戏日（1 起）。
 * @param seed - 种子。
 * @returns 当日行情倍率。
 */
export declare function priceMultiplier(species: SpeciesId, day: number, seed: number): number;
/**
 * 颜色加成：三通道均值映射到 ×1.0 - ×1.5（越鲜艳越贵）。
 * @param genes - 颜色基因。
 * @returns 售价倍率。
 */
export declare function colorMultiplier(genes: Genes): number;
/**
 * 鱼的大小阶段：0 鱼苗 → 1 成长期 → 2 成鱼；由累计喂食天数驱动，
 * 中期阈值 = ceil(growDays / 2)，成鱼阈值 = growDays。
 * @param fish - 塘中鱼。
 * @returns 大小阶段（0-2）。
 */
export declare function stageOf(fish: PondFish): 0 | 1 | 2;
/** 是否停滞生长（连饿 2 天）。 */
export declare function isStarving(fish: PondFish): boolean;
/**
 * 当前关卡下咬钩判定的半窗（秒）：0.55 起步、每关收窄 0.09，最低 0.16。
 * @param levelIndex - 0 起的关卡下标。
 * @returns 半窗秒数。
 */
export declare function biteHalfWindow(levelIndex: number): number;
/**
 * 提竿时机判定：elapsed 在咬钩时刻 ±半窗内命中，之前为早、之后为晚。
 * @param elapsed - 抛竿后流逝秒数。
 * @param biteAt - 咬钩时刻。
 * @param halfWindow - 半窗秒数。
 * @returns 判定结果。
 */
export declare function judgeBite(elapsed: number, biteAt: number, halfWindow: number): 'hit' | 'early' | 'late';
/** 随机 roll 一组颜色基因（三通道各 0-9）。 */
export declare function rollGenes(rng: () => number): Genes;
/**
 * 双亲基因混合：每个通道先随机取父或母，再以小概率 ±1 变异并钳制 0-9。
 * 每通道固定消耗 2-3 次 rng（取亲本 1 次、变异判定 1 次、变异方向 1 次）。
 * @param a - 亲本 A 基因。
 * @param b - 亲本 B 基因。
 * @param rng - 注入的随机源。
 * @returns 子代基因。
 */
export declare function mixGenes(a: Genes, b: Genes, rng: () => number): Genes;
/**
 * 按钓取池抽取一条鱼：先按层权重（普通/稀有/传说）定层——力度质量放大
 * 稀有与传说权重——再按层内权重定品种，最后随机性别与颜色基因。
 * @param rng - 注入的随机源。
 * @param quality - 力度质量 0..1。
 * @param id - 鱼 id。
 * @returns 新钓到的鱼（鱼苗阶段）。
 */
export declare function rollFish(rng: () => number, quality: number, id: number): PondFish;
/** 建一条指定品种的鱼（商店鱼苗/测试用），基因由 rng 随机。 */
export declare function makeFish(id: number, species: SpeciesId, rng: () => number): PondFish;
/** 空闲塘格下标（行优先第一个空格）。 */
export declare function firstEmptySlot(state: FishpondState): number;
/**
 * 创建一局初始状态：开局一公一母两条鲫鱼苗与 4 份鱼粮，塘 6 格。
 * @param seed - 注入的随机种子，同种子逐局可复现。
 * @param levelIndex - 0 起的关卡下标（越界钳制）。
 * @returns 就绪的 FishpondState（phase='playing'）。
 */
export declare function createFishpondState(seed: number, levelIndex?: number): FishpondState;
/** 是否集齐 6 品种。 */
export declare function allSpeciesCollected(state: FishpondState): boolean;
/**
 * 关卡目标判定：金额达标（终关还需集齐 6 品种）即 phase='won'。
 * 在金币增加或新品种入塘后调用。
 * @param state - 游戏状态，原地更新。
 */
export declare function checkLevelGoal(state: FishpondState): void;
/** 过关后进入下一关（保留塘、金币与图鉴；终关不再推进）。 */
export declare function nextLevel(state: FishpondState): void;
/** 钓鱼的当前结果是否成功（result 状态下查询）。 */
export declare function fishingSucceeded(fishing: FishingState): boolean;
/**
 * 开始一次抛竿：消耗 1 体力进入力度扫描。体力不足或状态机未空闲返回 false。
 * @param state - 游戏状态，原地更新。
 * @returns 是否成功进入力度扫描。
 */
export declare function beginCast(state: FishpondState): boolean;
/**
 * 推进力度条 ping-pong 扫描（index 层按 dt 驱动）。
 * @param state - 游戏状态，原地更新。
 * @param dt - 秒。
 */
export declare function tickPower(state: FishpondState, dt: number): void;
/**
 * 锁定力度：在甜区内排定咬钩时刻进入等待；区外线断，立即失败（体力已扣）。
 * @param state - 游戏状态，原地更新。
 * @returns 是否抛竿成功（进入等待咬钩）。
 */
export declare function lockPower(state: FishpondState): boolean;
/**
 * 推进等咬钩时间：超过咬钩时刻 + 半窗 ×宽限仍不提竿，鱼自动脱钩。
 * @param state - 游戏状态，原地更新。
 * @param dt - 秒。
 */
export declare function tickWait(state: FishpondState, dt: number): void;
/**
 * 提竿：按 judgeBite 判定时机；命中则从钓取池抽鱼进入 result，
 * 早/晚都失败（体力已扣，可重试）。
 * @param state - 游戏状态，原地更新。
 * @returns 判定结果。
 */
export declare function strike(state: FishpondState): 'caught' | 'early' | 'late' | 'not-casting';
/**
 * 确认钓鱼结果：钓到的鱼放入第一个空格并登记图鉴（满塘则放生）；
 * 失败结果直接收杆。状态机回到 idle。
 * @param state - 游戏状态，原地更新。
 * @returns 钓到的鱼是否成功入塘。
 */
export declare function acknowledgeResult(state: FishpondState): boolean;
/**
 * 当前卖出一条成鱼的实收价：基准价 × 当日行情 × 颜色加成 × 阶段倍率。
 * @param state - 游戏状态。
 * @param fish - 待估价的鱼。
 * @returns 取整后的卖价（鱼苗/成长期也有估价，但仅成鱼可卖）。
 */
export declare function sellPrice(state: FishpondState, fish: PondFish): number;
/** 塘内点击结果（渲染层给粒子/提示）。 */
export type PondClickResult = 'fed' | 'already-fed' | 'no-food' | 'sell-pending' | 'sold' | 'empty' | 'none';
/**
 * 点击塘格的语境化动作：幼鱼（鱼苗/成长期）→ 喂食（每天 1 次、耗 1 鱼粮）；
 * 成鱼 → 第一次点击挂起出售确认，再点一次卖出并按当日行情入账。
 * @param state - 游戏状态，原地更新。
 * @param slot - 塘格下标（越界/空格返回 'empty'）。
 * @returns 动作结果。
 */
export declare function pondClick(state: FishpondState, slot: number): PondClickResult;
/** 商店鱼苗价（基准价的一半，取整至少 1）。 */
export declare function fryCost(species: SpeciesId): number;
/** 当前扩塘花费（满塘或无后续档位返回 -1）。 */
export declare function expansionCost(state: FishpondState): number;
/**
 * 买鱼苗：扣款放入第一个空格并登记图鉴。
 * @param state - 游戏状态，原地更新。
 * @param species - 品种 id（仅限商店 3 种常见鱼）。
 * @returns 是否购买成功。
 */
export declare function buyFry(state: FishpondState, species: SpeciesId): boolean;
/**
 * 买一份鱼粮。
 * @param state - 游戏状态，原地更新。
 * @returns 是否购买成功。
 */
export declare function buyFood(state: FishpondState): boolean;
/**
 * 扩塘一格（6 → 9 封顶，逐格涨价）。
 * @param state - 游戏状态，原地更新。
 * @returns 是否扩建成功。
 */
export declare function buyExpansion(state: FishpondState): boolean;
/** 塘格的正交邻居（3 列网格，越界与未扩建格不计）。 */
export declare function slotNeighbors(slot: number, slots: number): number[];
/**
 * 繁殖配对检查：两条成鱼同品种、异性、相邻，且双方都已过冷却期。
 * @param a - 鱼 A。
 * @param b - 鱼 B。
 * @param day - 当前游戏日。
 * @returns 是否可繁殖。
 */
export declare function canBreed(a: PondFish, b: PondFish, day: number): boolean;
/**
 * 结束今天：逐鱼结算生长（喂过的 +1 天并清零饥饿，没喂的累计饥饿）→
 * 自动繁殖（产 1-2 条混合基因鱼苗入空格、双方进入冷却）→ 回复体力 →
 * 翻到新的一天并刷新行情。随机只走 rng，逐日可重放。
 * @param state - 游戏状态，原地更新。
 */
export declare function nextDay(state: FishpondState): void;
