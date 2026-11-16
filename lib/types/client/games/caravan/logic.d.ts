/**
 * 丝路商队纯逻辑：多城套利经营的完整规则引擎，与渲染完全解耦。
 *
 * 核心模型：seed 生成连通城市图（道路带移动/耗水），五种商品按
 * 「城市基准差价 × 正弦波动 × 城市相关噪声」逐日定价；到访过的城市
 * 行情精确，未到访城市显示 ±20% 模糊价。每天可在城中按仓位买卖，
 * 沿道路移动（耗移动力与水，绿洲补水），空格结束今天并翻开事件卡
 * （战乱涨价 / 丰收跌价 / 税吏征税）。限定天数内资产达标即过关。
 *
 * 所有随机都走注入 seed（mulberry32 单步推进的整数状态），同 seed
 * 同操作序列必然得到逐字段相同的状态——全程可重放。
 */
/** 逻辑画布尺寸（渲染与逻辑共享的固定坐标系）。 */
export declare const W = 960;
export declare const H = 600;
/** 商品种数（茶/丝绸/香料/瓷/宝石）。 */
export declare const GOOD_COUNT = 5;
/** 未到访城市的行情模糊幅度（显示价 ±20%）。 */
export declare const FOG_PCT = 0.2;
/** 战乱/丰收事件的持续天数。 */
export declare const EVENT_DAYS = 2;
/** 绿洲道路经过时的补水量。 */
export declare const OASIS_WATER = 3;
/** 事件卡种类：war 某商品涨价、harvest 某商品跌价、tax 征税、none 无事。 */
export type EventKind = 'war' | 'harvest' | 'tax' | 'none';
/** 一张已翻开的事件卡（战乱/丰收附商品下标与幅度，税吏附税率）。 */
export interface EventCard {
    kind: EventKind;
    good: number;
    scale: number;
    label: string;
}
/** 生效中的行情事件：第 good 种商品在 until（含）之前按 scale 放大价格。 */
export interface ActiveEvent {
    good: number;
    until: number;
    scale: number;
}
/** 一种商品的名称与基准单价。 */
export interface Good {
    name: string;
    base: number;
}
/** 五种商品：基准价从茶到宝石递增，构成风险/收益梯度。 */
export declare const GOODS: readonly Good[];
/** 一条道路：通往邻城，耗 moveCost 点移动力与 waterCost 点水；绿洲途经补水。 */
export interface Road {
    to: number;
    moveCost: number;
    waterCost: number;
    oasis: boolean;
}
/** 一座城市：卷轴坐标、逐商品基准差价与波动相位、邻接道路。 */
export interface City {
    name: string;
    x: number;
    y: number;
    mult: number[];
    phase: number[];
    roads: Road[];
}
/** 一关参数：城市数、天数、资产目标、骆驼数（=仓位=每日移动力）与水囊上限。 */
export interface LevelConfig {
    cities: number;
    days: number;
    goal: number;
    camels: number;
    waterCap: number;
    money: number;
}
/** 五关递进：城市更多、天数更长、目标更高，骆驼与水囊也逐渐宽裕。 */
export declare const LEVELS: readonly LevelConfig[];
/** 生成完毕的世界：城市图 + 逐日逐城逐商品的噪声表（确定性）。 */
export interface CaravanWorld {
    level: number;
    config: LevelConfig;
    cities: City[];
    /** noise[city][good][day]：全局相关分量 + 城市本地分量。 */
    noise: number[][][];
}
/** 一局的全部可变状态；world 由同 seed 确定性生成。 */
export interface CaravanState {
    world: CaravanWorld;
    seed: number;
    day: number;
    cityIdx: number;
    money: number;
    water: number;
    movePoints: number;
    cargo: number[];
    visited: boolean[];
    selectedGood: number;
    /** 事件抽取的整数随机状态（mulberry32 单步）。 */
    rngS: number;
    activeEvents: ActiveEvent[];
    lastCard: EventCard | null;
    phase: 'playing' | 'won' | 'lost';
    log: string[];
}
/**
 * mulberry32 随机源：返回 [0,1) 的函数（世界生成用一次性闭包版本）。
 * @param seed - 任意 32 位整数种子。
 * @returns 逐次调用返回确定性伪随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/**
 * 推进状态内的整数随机状态并返回 [0,1)（事件抽取用，保证状态可序列化重放）。
 * @param s - 商队状态（原地推进 rngS）。
 * @returns 确定性伪随机数。
 */
export declare function rand(s: CaravanState): number;
/**
 * 生成一关的世界：seed 决定道路网、基准差价、波动相位与逐日噪声。
 * 环状道路保证连通，再按 seed 补 2-3 跳的商道捷径。
 * @param seed - 种子。
 * @param level - 0 起的关序号。
 * @returns 确定性生成的世界。
 */
export declare function createWorld(seed: number, level: number): CaravanWorld;
/**
 * 创建一局：长安（0 号城）出发，水囊满、移动力满、行情已精确。
 * @param seed - 种子（同 seed 同关必然生成相同世界与事件序列）。
 * @param level - 0 起的关序号。
 * @returns 初始状态（phase 恒为 playing）。
 */
export declare function createCaravan(seed: number, level: number): CaravanState;
/**
 * 无事件的原始行情：基准价 × 城市差价 ×（正弦波动 + 城市相关噪声）。
 * @param world - 世界。
 * @param city - 城市下标。
 * @param good - 商品下标。
 * @param day - 天数（1 起）。
 * @returns 取整后的原始单价（≥1）。
 */
export declare function rawPrice(world: CaravanWorld, city: number, good: number, day: number): number;
/**
 * 当前生效单价：原始行情再乘生效中的战乱/丰收事件幅度。
 * @param s - 商队状态。
 * @param city - 城市下标。
 * @param good - 商品下标。
 * @param day - 天数（默认当天）。
 * @returns 取整后的成交单价。
 */
export declare function priceAt(s: CaravanState, city: number, good: number, day?: number): number;
/**
 * 未到访城市的模糊显示价：真值乘 ±20% 的确定性扰动，与到访状态解耦。
 * @param s - 商队状态。
 * @param city - 城市下标。
 * @param good - 商品下标。
 * @returns 到访过则等于真值；否则为真值 ±20% 的抖动值。
 */
export declare function visiblePrice(s: CaravanState, city: number, good: number): number;
/** 仓位上限 = 骆驼数（每峰骆驼驮一件货）。 */
export declare function capacity(s: CaravanState): number;
/** 已占仓位（各商品件数之和）。 */
export declare function cargoUsed(s: CaravanState): number;
/** 资产额 = 银钱 + 全部存货按当前城市行情的估值。 */
export declare function netWorth(s: CaravanState): number;
/**
 * 在当前城市买入商品：校验仓位与银钱，按当日单价整额结算。
 * @param s - 商队状态。
 * @param good - 商品下标。
 * @param qty - 件数（>0）。
 * @returns 成功与否；失败时状态不变。
 */
export declare function buy(s: CaravanState, good: number, qty: number): boolean;
/**
 * 在当前城市卖出商品：校验存货，按当日单价整额入账。
 * @param s - 商队状态。
 * @param good - 商品下标。
 * @param qty - 件数（>0）。
 * @returns 成功与否；失败时状态不变。
 */
export declare function sell(s: CaravanState, good: number, qty: number): boolean;
/** 找一条从当前城市通往 to 的道路；不相邻返回 undefined。 */
export declare function roadTo(s: CaravanState, to: number): Road | undefined;
/**
 * 移动是否合法：相邻、移动力足够、水足够，且对局进行中。
 * @param s - 商队状态。
 * @param to - 目标城市下标。
 */
export declare function canMove(s: CaravanState, to: number): boolean;
/**
 * 商队启程：扣移动力与水，抵达后该城行情精确化；绿洲道路补水（不超上限）。
 * @param s - 商队状态。
 * @param to - 相邻目标城市下标。
 * @returns 成功与否；失败时状态不变。
 */
export declare function move(s: CaravanState, to: number): boolean;
/**
 * 抽一张事件卡（推进状态随机源；仅供 endDay 与测试调用）。
 * @param s - 商队状态。
 * @returns 事件卡：三成无事，战乱/丰收/税吏各约两成多。
 */
export declare function drawCard(s: CaravanState): EventCard;
/**
 * 让一张事件卡生效（战乱/丰收挂入生效表，税吏立即扣现钱）。
 * @param s - 商队状态。
 * @param card - 事件卡。
 */
export declare function applyCard(s: CaravanState, card: EventCard): void;
/**
 * 结束今天：天数 +1、城中补给水囊、移动力回满、过期事件失效、翻开
 * 新事件卡；越过期限后按资产额判定胜负。
 * @param s - 商队状态（非 playing 时为空操作）。
 */
export declare function endDay(s: CaravanState): void;
