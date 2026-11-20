/**
 * 传送带工厂 Factory 纯逻辑：离散 tick 的传送带布局谜题（简化 Factorio）。
 * 关卡 = 固定元素（出口源 / 需求槽 / 种子岩石）+ 玩家放置（四向传送带、
 * 多种配方机器）。每 tick：源按节拍产出原料到面朝的带、机器在周期满后
 * 吐出成品到面朝的带、带上的物品沿带向同步前移一格（依赖递归判定，
 * 长队一 tick 整体前移；对头互撞 / 目标非带 / 需求不匹配 = 堵死红显）。
 * 无 DOM、无全局随机——岩石位置走注入 seed 的 mulberry32，同一 seed
 * 永远生成同一批关卡；参考布局重放可解性由测试验证。
 */
/** 朝向：0=上 1=右 2=下 3=左（右转为 +1 mod 4）。 */
export type Dir = 0 | 1 | 2 | 3;
/** 朝向 → 单位位移（下标即 Dir 值）。 */
export declare const DX: number[];
export declare const DY: number[];
/** 物料编码：A/B 原料，A2/B2 精炼料，C/D 成品。 */
export type Mat = 'A' | 'B' | 'A2' | 'B2' | 'C' | 'D';
/** 一种机器配方：吞入 inputs、每 period tick 产出 1 个 output。 */
export interface MachineKind {
    /** 稳定 id（关卡内唯一，放置与命中测试引用）。 */
    readonly id: string;
    /** 中文名（按钮与配方角标显示）。 */
    readonly name: string;
    /** 单字图标字形（如 '熔' '组' '重'）。 */
    readonly glyph: string;
    /** 配方输入（物料 → 需要数量，1..2 种物料）。 */
    readonly inputs: Readonly<Partial<Record<Mat, number>>>;
    /** 产出物料。 */
    readonly output: Mat;
    /** 产出周期 tick 数（吞齐原料后倒数）。 */
    readonly period: number;
}
/** 出口源：面朝方向每 interval tick 产出 1 个 kind 原料。 */
export interface SourceSpec {
    readonly x: number;
    readonly y: number;
    readonly dir: Dir;
    readonly kind: Mat;
    readonly interval: number;
}
/** 需求槽：收满 product×quota 即完成该槽订单。 */
export interface DemandSpec {
    readonly x: number;
    readonly y: number;
    readonly product: Mat;
    readonly quota: number;
}
/** 玩家的一次放置：传送带或机器（machine 为 MachineKind id）。 */
export interface Placement {
    readonly x: number;
    readonly y: number;
    readonly dir: Dir;
    readonly type: 'belt' | 'machine';
    readonly machine?: string;
}
/** 关卡原始规格（网格尺寸 + 固定元素 + 配方集 + 约束 + 参考布局）。 */
export interface FactoryLevelSpec {
    readonly id: number;
    readonly name: string;
    readonly w: number;
    readonly h: number;
    readonly sources: readonly SourceSpec[];
    readonly demands: readonly DemandSpec[];
    readonly machines: readonly MachineKind[];
    /** 放置数上限（带 + 机器合计，谜题核心约束）。 */
    readonly maxPieces: number;
    /** 模拟 tick 上限（超时未达标 = 失败）。 */
    readonly ticks: number;
    /** 岩石数量（位置由 seed 决定，避开固定格与参考布局格）。 */
    readonly rockCount: number;
    /** 岩石生成种子。 */
    readonly seed: number;
    /** 已验证可解的参考布局。 */
    readonly reference: readonly Placement[];
}
/** 格子类型编码（cells 数组元素）。 */
export declare const CELL_FLOOR = 0;
export declare const CELL_ROCK = 1;
export declare const CELL_SOURCE = 2;
export declare const CELL_DEMAND = 3;
/** 解析后的可运行关卡。 */
export interface FactoryLevel {
    readonly id: number;
    readonly name: string;
    readonly w: number;
    readonly h: number;
    readonly cells: Uint8Array;
    readonly sources: readonly SourceSpec[];
    readonly demands: readonly DemandSpec[];
    readonly machines: readonly MachineKind[];
    readonly kindById: ReadonlyMap<string, MachineKind>;
    readonly maxPieces: number;
    readonly ticks: number;
    readonly reference: readonly Placement[];
}
/**
 * 注入式确定性随机源（mulberry32）。
 * @param seed 种子。
 * @returns 返回 [0,1) 的随机函数；同 seed 同序列。
 */
export declare function mulberry32(seed: number): () => number;
/**
 * 解析关卡规格：固定元素入格，并用 spec.seed 生成 rockCount 块岩石。
 * 岩石只落在内部空地（1≤x≤w-2、1≤y≤h-2），永远避开固定格与参考布局
 * 占用的格子——因此任意 seed 下参考布局都保持可解。
 * @param spec 原始规格。
 * @param seedOverride 可选的岩石种子覆盖（测试用）。
 * @returns 解析后的关卡。
 * @throws 固定元素越界 / 机器配方引用未知 id 时抛错（内置数据应加载期暴露）。
 */
export declare function buildLevel(spec: FactoryLevelSpec, seedOverride?: number): FactoryLevel;
/** 内置 5 关：单级组装 → 熔炼+组装 → 极限放置 → 三级链 → 双线订单。 */
export declare const FACTORY_LEVELS: readonly FactoryLevelSpec[];
/**
 * 全部内置关卡（按序解析）。
 * @param seedOverride 可选岩石种子覆盖；缺省用各关自带 seed。
 * @returns 解析后的关卡数组（确定性：同 seed 同结果）。
 */
export declare function getLevels(seedOverride?: number): FactoryLevel[];
/**
 * 校验一组放置是否可用于关卡。
 * @param level 目标关卡。
 * @param placements 待校验放置。
 * @returns null 表示合法；否则为中文错误原因。
 */
export declare function validatePlacements(level: FactoryLevel, placements: readonly Placement[]): string | null;
/** 机器运行态（渲染与测试读取）。 */
export interface MachineView {
    readonly x: number;
    readonly y: number;
    readonly dir: Dir;
    readonly kindId: string;
    /** 当前缓冲的各物料数。 */
    readonly buffer: Readonly<Partial<Record<Mat, number>>>;
    /** 原料是否已吞齐（吞齐后 progress 递增至 period 产出）。 */
    readonly complete: boolean;
    readonly progress: number;
    readonly period: number;
}
/** 一件在带物品（渲染读取）。 */
export interface ItemView {
    readonly x: number;
    readonly y: number;
    readonly kind: Mat;
    /** 本 tick 刚产出（不参与本 tick 移动，渲染做出现动画）。 */
    readonly fresh: boolean;
}
/** 模拟器句柄（index.ts 逐帧驱动，测试直接步进）。 */
export interface FactorySim {
    /** 推进一个 tick（won/timeout 后再调用为空操作）。 */
    step(): void;
    /** 已推进的 tick 数（从 0 起，每次 step +1）。 */
    readonly tick: number;
    /** running=进行中；won=全部需求槽达标；timeout=tick 耗尽未达标。 */
    readonly status: 'running' | 'won' | 'timeout';
    /** 各需求槽已收数量（与 level.demands 同序）。 */
    readonly demandCounts: readonly number[];
    /** 全部在带物品。 */
    items(): ItemView[];
    /** 本 tick 堵死的格子索引数组（渲染红闪）。 */
    jammed(): number[];
    /** 全部机器运行态（放置序）。 */
    machines(): MachineView[];
}
/**
 * 创建确定性模拟器。
 * @param level 目标关卡。
 * @param placements 玩家放置（需先通过 validatePlacements）。
 * @returns 模拟器句柄。
 * @throws 放置非法时抛错（调用方应先校验）。
 */
export declare function createSim(level: FactoryLevel, placements: readonly Placement[]): FactorySim;
/** runSimulation 的返回摘要。 */
export interface SimSummary {
    status: 'won' | 'timeout';
    ticksUsed: number;
    demandCounts: number[];
}
/**
 * 一步到位跑完整局（测试与关卡可解性验证）。
 * @param level 目标关卡。
 * @param placements 玩家放置。
 * @returns 终局摘要（确定性：同输入同输出）。
 */
export declare function runSimulation(level: FactoryLevel, placements: readonly Placement[]): SimSummary;
