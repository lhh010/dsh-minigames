/**
 * 炼金工坊纯逻辑：元素库与硬编码配方表（Little Alchemy 式合成发现）、
 * 无序配对判定（同一对可产多物）、已试组合记忆、发现里程碑（5 关递进）、
 * 种子确定性的半配方提示、状态序列化。全部为确定性纯逻辑，随机只走
 * 注入的 mulberry32 种子；不含任何 DOM / canvas 依赖，可直接单测。
 */
/** mulberry32 种子随机数发生器（确定性，[0, 1)）。 */
export declare function mulberry32(seed: number): () => number;
/** 元素类别（决定元素架分组与图鉴排序，仅展示用）。 */
export type ElementCategory = 'basic' | 'nature' | 'material' | 'life' | 'civ';
/** 类别的中文标签（元素架分组标题）。 */
export declare const CATEGORY_LABELS: Readonly<Record<ElementCategory, string>>;
/** 一个元素：稳定 id、中文名、emoji 图标、类别。 */
export interface ElementDef {
    /** 稳定唯一 id（配方表引用它）。 */
    id: string;
    /** 中文显示名。 */
    name: string;
    /** emoji 图标（库内唯一）。 */
    icon: string;
    /** 类别。 */
    category: ElementCategory;
}
/** 四个基本元素（起始即可用，不出现在任何配方产物里）。 */
export declare const BASE_IDS: readonly string[];
/** 内置元素库（86 款：4 基本 + 82 合成产物），按类别成段排列。 */
export declare const ELEMENTS: readonly ElementDef[];
/** id → 元素定义。 */
export declare const ELEMENT_BY_ID: ReadonlyMap<string, ElementDef>;
/** 无序原料对的键（a+b 按 id 排序，双向同键）。 */
export declare function pairKey(a: string, b: string): string;
/** 原料对 → 产物列表（按配方表声明顺序）。 */
export declare const PAIR_RESULTS: ReadonlyMap<string, readonly string[]>;
/** 产物 → 全部配方（原料对，按声明顺序）——提示系统从中取样。 */
export declare const RECIPES_FOR: ReadonlyMap<string, ReadonlyArray<readonly [string, string]>>;
/**
 * 从四基本元素出发沿配方表广度优先搜索。
 * @returns 可达元素的 id 集合（配方表完整性校验用）。
 */
export declare function reachableFromBase(): Set<string>;
/** 元素库中不可从基本元素合成的 id 列表（应为空）。 */
export declare function unreachableElements(): string[];
/** 五关里程碑：累计发现 15/25/35/45/55 种元素。 */
export declare const MILESTONES: readonly number[];
/**
 * 发现数对应的里程碑关卡（0..5）。
 * @param discoveredCount 已发现元素种数（含 4 基本元素）。
 */
export declare function milestoneLevel(discoveredCount: number): number;
/** 一局游戏的全部可序列化状态。 */
export interface AlchemyState {
    /** 已发现元素 id（按发现顺序，含 4 基本元素）。 */
    discovered: string[];
    /** 已尝试过的原料对键（a+b 排序），避免反复试错无解组合。 */
    tried: string[];
    /** 已消耗的提示次数。 */
    hintsUsed: number;
    /** 元素 id → 已揭示的配方原料 id（半提示）。 */
    hints: Record<string, string>;
    /** 提示随机种子（决定提示选取顺序，可测）。 */
    hintSeed: number;
}
/**
 * 新建一局：只发现四基本元素、无已试组合、无提示。
 * @param hintSeed - 提示种子（0 也合法；同种子同提示序列）。
 */
export declare function createInitialState(hintSeed: number): AlchemyState;
/** 一次合成尝试的结果。 */
export type CombineResult = {
    type: 'new';
    element: string;
} | {
    type: 'repeat';
    element: string;
} | {
    type: 'none';
};
/**
 * 尝试合成（就地更新状态：记 tried，新元素入 discovered）。
 * 判定与原料顺序无关：fire+water 与 water+fire 同键。
 * @param state - 一局状态（就地修改）。
 * @param a - 原料 A 的元素 id（须已发现，调用方保证）。
 * @param b - 原料 B 的元素 id。
 * @returns new=首次发现；repeat=配方存在但产物全部已发现；none=无配方。
 */
export declare function combine(state: AlchemyState, a: string, b: string): CombineResult;
/**
 * 剩余可用提示次数：已达成的里程碑关卡数即总配额。
 * @param state - 一局状态。
 */
export declare function hintBudget(state: AlchemyState): number;
/** 一次提示请求的结果。 */
export type HintResult = {
    type: 'hint';
    element: string;
    ingredient: string;
} | {
    type: 'exhausted';
} | {
    type: 'none';
};
/**
 * 请求一条半配方提示（就地更新状态：hintsUsed+1、记录揭示的原料）。
 * 选取确定性：mulberry32(hintSeed ^ (hintsUsed+1)*黄金比例) 在候选集上
 * 取下标；候选优先「就绪」元素，排除已提示过的元素。
 * @param state - 一局状态（就地修改）。
 * @returns hint=目标元素与揭示的一个原料；exhausted=配额不足；none=无候选。
 */
export declare function requestHint(state: AlchemyState): HintResult;
/**
 * 状态序列化为 JSON 字符串（版本包裹，供本地存档/恢复）。
 * @param state - 一局状态。
 */
export declare function serializeState(state: AlchemyState): string;
/**
 * 反序列化（严格校验：版本不符、未知元素 id、负数计数均拒绝）。
 * @param json - serializeState 的输出。
 * @returns 状态；任何字段非法返回 null。
 */
export declare function deserializeState(json: string): AlchemyState | null;
/**
 * 计分：每发现一种元素 10 分，每个已达成的里程碑再奖 100 分。
 * @param state - 一局状态。
 */
export declare function scoreOf(state: AlchemyState): number;
/**
 * 局面是否通关（第 5 个里程碑达成）。
 * @param state - 一局状态。
 */
export declare function isComplete(state: AlchemyState): boolean;
/**
 * 元素显示名（未知 id 返回 '?'，渲染兜底）。
 * @param id - 元素 id。
 */
export declare function nameOf(id: string): string;
/**
 * 元素图标（未知 id 返回 '❓'，渲染兜底）。
 * @param id - 元素 id。
 */
export declare function iconOf(id: string): string;
