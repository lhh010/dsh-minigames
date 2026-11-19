/**
 * 收获季节纯逻辑：轮作时间线农事规划。6×6 田格 + 一季 12 周，每周 2 个
 * 动作（播种/浇水/收获/休耕）；作物卡池与天气周序列均由注入 seed 的
 * mulberry32 派生，玩家动作不消耗随机数——同一 seed 逐动作重放完全一致。
 * 核心机制：生长计数与过熟腐烂、同科连作减产 30%、肥力消耗与豆科恢复、
 * 旱周需浇水才生长、雨周免费加速、虫周减产、温室格双倍生长；季末按
 * 资产+库存结算并结转盈余进入更难的下一季（共 5 季）。
 * 无 DOM、无计时器，全部为确定性纯函数。
 */
/** 作物 id（卡池候选，共 7 种，每季抽 4）。 */
export type CropId = 'radish' | 'wheat' | 'soybean' | 'cabbage' | 'tomato' | 'corn' | 'pumpkin';
/** 作物科别：同科连作触发减产；豆科收获后恢复肥力。 */
export type CropFamily = 'root' | 'grass' | 'legume' | 'brassica' | 'fruit';
/** 一种作物的经济与生长参数。 */
export interface CropSpec {
    /** 中文短名。 */
    name: string;
    /** 科别。 */
    family: CropFamily;
    /** 种子买价（播种动作时从资金扣除）。 */
    seedCost: number;
    /** 从播种到成熟需要的生长周数。 */
    growWeeks: number;
    /** 基准售价（收获产量公式的基数）。 */
    sellPrice: number;
    /** 播种时消耗的肥力点。 */
    fertDrain: number;
    /** 是否豆科（收获后该格肥力 +30）。 */
    legume: boolean;
    /** 果实色（渲染层与粒子共用）。 */
    color: string;
}
/** 候选作物全集：快利薄（萝卜/小麦）到慢利厚（南瓜）+ 轮作枢纽豆科。 */
export declare const CROP_POOL: Record<CropId, CropSpec>;
/** 全部候选作物 id（卡池抽取的固定顺序源）。 */
export declare const CROP_POOL_IDS: CropId[];
/** 每季抽入卡池的作物数。 */
export declare const POOL_SIZE = 4;
/** 当周天气。 */
export type Weather = 'sunny' | 'rain' | 'drought' | 'pest';
/** 天气中文短名（渲染横幅与提示共用）。 */
export declare const WEATHER_NAME: Record<Weather, string>;
/** 一季的难度参数。 */
export interface SeasonSpec {
    /** 季末达标金额（资金+库存 ≥ 此值过关）。 */
    target: number;
    /** 天气权重（晴/雨/旱/虫，逐季恶化）。 */
    weights: Record<Weather, number>;
    /** 温室格数量（双倍生长）。 */
    greenhouses: number;
}
/** 5 季递进：目标金额上涨、天气恶化、第 3 季起引入温室格。 */
export declare const SEASONS: SeasonSpec[];
/** 田格边长（6×6）。 */
export declare const GRID = 6;
/** 一季总周数。 */
export declare const WEEKS_PER_SEASON = 12;
/** 每周可用动作数。 */
export declare const ACTIONS_PER_WEEK = 2;
/** 成熟后再经 2 个周末即腐烂。 */
export declare const ROT_WEEKS = 2;
/** 同科连作产量乘数。 */
export declare const CONTINUITY_MULT = 0.7;
/** 每个虫周的产量质量乘数。 */
export declare const PEST_MULT = 0.8;
/** 产量质量下限。 */
export declare const QUALITY_MIN = 0.4;
/** 休耕动作恢复的肥力点。 */
export declare const FALLOW_GAIN = 25;
/** 豆科收获恢复的肥力点。 */
export declare const LEGUME_GAIN = 30;
/** 肥力上限。 */
export declare const FERT_MAX = 100;
/** 每季基础启动资金（另加上一季结转盈余）。 */
export declare const START_MONEY = 60;
/** 一块田格。 */
export interface HarvestTile {
    /** 当前肥力（0..100，影响产量）。 */
    fertility: number;
    /** 在种作物；空地为 null。 */
    crop: CropId | null;
    /** 已累计生长周数（>= growWeeks 即成熟）。 */
    growth: number;
    /** 本周是否已被浇水（旱周生长的必要条件）。 */
    watered: boolean;
    /** 产量质量乘数（虫害递减）。 */
    quality: number;
    /** 成熟后已经过的周数（>= ROT_WEEKS 腐烂）。 */
    overWeeks: number;
    /** 上一次在该格种植的科别（连作判定基准）。 */
    lastFamily: CropFamily | null;
    /** 是否温室格（周末生长 +2 而非 +1）。 */
    greenhouse: boolean;
}
/** 季末结算结果（渲染层结算面板用）。 */
export interface SeasonResult {
    /** 是否达标。 */
    passed: boolean;
    /** 结算时资产（资金+库存）。 */
    assets: number;
    /** 本季目标。 */
    target: number;
}
/** 一局状态。 */
export interface HarvestState {
    phase: 'playing' | 'seasonEnd' | 'won' | 'lost';
    /** 0 起的季节下标。 */
    seasonIndex: number;
    /** 本季派生随机流的种子（下一季结转时复用）。 */
    seed: number;
    /** 当前周（1..WEEKS_PER_SEASON）。 */
    week: number;
    /** 本周剩余动作数。 */
    actionsLeft: number;
    /** 当周天气。 */
    weather: Weather;
    /** 全季天气序列（下标 week-1）。 */
    weatherSeq: Weather[];
    money: number;
    /** 库存价值（收获入账，季末折算成资金）。 */
    inventoryValue: number;
    /** 行优先田格。 */
    tiles: HarvestTile[];
    /** 本季作物卡池（seed 派生，4 张）。 */
    cardPool: CropId[];
    /** 选中的卡池下标（播种用）。 */
    selectedCard: number;
    /** 最近一条事件提示（渲染层显示）。 */
    lastEvent: string;
    /** 季末结算结果；进行期为 null。 */
    seasonResult: SeasonResult | null;
}
/**
 * 创建一季初始状态：卡池、天气序列、温室格均由 seed+season 派生。
 * @param seed - 注入的随机种子。
 * @param seasonIndex - 0 起的季节下标。
 * @param carryMoney - 上一季结转盈余（加在基础启动资金上）。
 * @returns 新的进行期一局状态。
 */
export declare function createHarvestState(seed: number, seasonIndex: number, carryMoney?: number): HarvestState;
/** 当前总资产（资金 + 库存价值），计分与达标判定共用。 */
export declare function totalAssets(state: HarvestState): number;
/** 田格是否已有成熟可收作物（growth 达标且未腐烂）。 */
export declare function isMature(tile: HarvestTile): boolean;
/**
 * 在田格上播种当前选中卡：扣种子钱、扣肥力、记录科别。
 * @param state - 一局状态。
 * @param index - 田格下标（0..35）。
 * @returns 是否成功（进行期、有动作、空格、资金足够）。
 */
export declare function plantCrop(state: HarvestState, index: number): boolean;
/**
 * 浇水：立即 +1 生长并满足旱周需水要求。
 * @param state - 一局状态。
 * @param index - 田格下标。
 * @returns 是否成功（进行期、有动作、有种植物且未成熟）。
 */
export declare function waterTile(state: HarvestState, index: number): boolean;
/**
 * 收获成熟作物：产量 = 售价 × 肥力系数 × 质量 × 连作乘数，入库存；
 * 豆科额外恢复该格肥力。
 * @param state - 一局状态。
 * @param index - 田格下标。
 * @returns 成功时返回入账价值，失败返回 null。
 */
export declare function harvestTile(state: HarvestState, index: number): number | null;
/**
 * 休耕空地：恢复肥力（不消耗种子钱）。
 * @param state - 一局状态。
 * @param index - 田格下标。
 * @returns 是否成功（进行期、有动作、空地）。
 */
export declare function fallowTile(state: HarvestState, index: number): boolean;
/**
 * 推进到下一周：结算本周末生长/过熟，随后刷新天气、动作与虫害质量；
 * 第 12 周后进入季末结算。
 * @param state - 一局状态。
 */
export declare function nextWeek(state: HarvestState): void;
/**
 * 进入下一季（seasonEnd 后）：结转盈余 = 结算资产 - 目标。
 * @param state - 已结算的 seasonEnd 状态。
 * @returns 新季状态；非 seasonEnd 期原样返回 null。
 */
export declare function nextSeason(state: HarvestState): HarvestState | null;
