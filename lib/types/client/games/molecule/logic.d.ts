/**
 * 分子构建 (Molecule) 纯逻辑：Sokobond 式推原子。网格上有墙、若干原子
 * （H/C/O/N，各带化合价 H=1 O=2 N=3 C=4）与一个主原子（玩家）。主原子
 * 四向移动；撞上原子或原子团时按推箱子规则把该团整体推一格，推不动则
 * 整步失败。已成键的原子团刚性整体移动。两个原子正交相邻且双方都有
 * 空价时自动成键，键级 = min(2, 空价A, 空价B)（双键消耗 2 价）。全部
 * 原子连成一个团且所有价恰好饱和、元素计数符合目标式即过关。
 *
 * 全部为确定性纯函数（无 DOM、无全局随机）；随机性只经注入 seed
 * （mulberry32）暴露给渲染层的绘制顺序。单元测试直接驱动本模块，
 * 包括一个带节点预算的 BFS 求解器用于验证关卡可解性与最短步数。
 */
/** 支持的元素。 */
export type Element = 'H' | 'C' | 'O' | 'N';
/** 四个移动方向。 */
export type Dir = 'up' | 'down' | 'left' | 'right';
/** 元素化合价（可成键总数，双键消耗 2）。 */
export declare const VALENCE: Record<Element, number>;
/** 单对原子之间的最大键级（双键简化，不支持三键）。 */
export declare const MAX_BOND_ORDER = 2;
/** 每生成一根键的得分。 */
export declare const BOND_SCORE = 100;
/** 过关额外得分。 */
export declare const CLEAR_SCORE = 500;
/** 网格坐标。 */
export interface Position {
    r: number;
    c: number;
}
/** 一个原子：元素、位置与到其他原子的键（原子 id -> 键级）。 */
export interface Atom {
    id: number;
    el: Element;
    r: number;
    c: number;
    bonds: Record<number, number>;
}
/** 一关的手工数据：名称、分子式与初始盘面。 */
export interface MoleculeLevelDef {
    /** 目标分子中文名（如 水）。 */
    name: string;
    /** 规范分子式（如 H2O），必须与盘面原子计数一致。 */
    formula: string;
    /** 展示分子式（含下标字符，如 H₂O）。 */
    display: string;
    /** 提示结构串（如 H–O–H）。 */
    hint: string;
    /** 主原子（玩家）的元素。 */
    mainEl: Element;
    /**
     * 盘面行。字符：'#' 墙、空格/'.' 空地、'@' 主原子、H/C/O/N 原子。
     * 短行右侧补空格。初始盘面禁止任意两原子正交相邻（否则成键歧义）。
     */
    grid: string[];
}
/**
 * 十个手工关卡，递进：H₂O → CO₂ → NH₃ → CH₄ → C₂H₄ → O₂ → H₂O₂ →
 * CH₂O → CH₄O → CH₂O₂。后五关引入双键练习与多原子长链（键级上限 2，
 * 无三键；CO/乙炔因 C 无法在全饱和规则下成键，以甲醇/甲酸替代）。
 */
export declare const LEVELS: MoleculeLevelDef[];
/**
 * 每关最短解题步数（BFS 最优，测试与 PAR 常量互校验；渲染层显示为
 * “参考”步数）。
 */
export declare const PAR: number[];
/** 解析后的关卡：静态几何 + 初始原子布局。 */
export interface ParsedLevel {
    rows: number;
    cols: number;
    walls: boolean[][];
    atoms: {
        id: number;
        el: Element;
        r: number;
        c: number;
    }[];
    mainId: number;
}
/**
 * 解析并校验一个关卡定义。
 * @param def - 关卡定义。
 * @returns 解析后的几何与原子布局。
 * @throws 当盘面为空、主原子不是恰好一个、出现非法字符、初始存在
 *   正交相邻原子对、或原子计数与 def.formula 不一致时。
 */
export declare function parseLevel(def: MoleculeLevelDef): ParsedLevel;
/** 元素计数表。 */
export type Formula = Partial<Record<Element, number>>;
/**
 * 统计原子集合的元素计数。
 * @param atoms - 原子列表（或带 el 的等价对象）。
 * @returns 计数表。
 */
export declare function countsOf(atoms: {
    el: Element;
}[]): Formula;
/**
 * 把计数表格式化为分子式字符串（计数 1 省略），如 C2H4、NH3、H2O。
 * @param counts - 元素计数。
 * @returns 分子式字符串。
 */
export declare function formatFormula(counts: Formula): string;
/**
 * mulberry32 确定性伪随机数发生器：所有随机决策的唯一来源，注入
 * seed 后完全可重放。
 * @param seed - 非负整数种子。
 * @returns 返回 [0,1) 随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/** 一步移动的完整记录（动画与撤销用）。 */
export interface MoveEntry {
    id: number;
    from: Position;
    to: Position;
}
/** 一次施加的移动：平移了的原子与本步新生成的键。 */
export interface MoleculeMove {
    dir: Dir;
    moved: MoveEntry[];
    /** 本步新生成的键（原子 id 对 + 键级）。 */
    formed: {
        a: number;
        b: number;
        order: number;
    }[];
    /** 本步过关。 */
    cleared: boolean;
}
/** 撤销快照：完整原子布局 + 计数。 */
interface Snapshot {
    atoms: Atom[];
    moves: number;
    score: number;
}
/** 游戏状态：盘面、原子、键、计分与历史。 */
export interface MoleculeState {
    levelIndex: number;
    rows: number;
    cols: number;
    walls: boolean[][];
    atoms: Atom[];
    mainId: number;
    /** 目标元素计数（等于关卡原子计数）。 */
    target: Formula;
    /** 本关定义（名称/展示式/提示）。 */
    def: MoleculeLevelDef;
    /** 本关最短步数参考。 */
    par: number;
    moves: number;
    score: number;
    /** 本关开始时的分数；重开回滚到它。 */
    entryScore: number;
    history: Snapshot[];
    cleared: boolean;
    /** 注入的确定性随机源（仅供渲染层绘制顺序等装饰用途）。 */
    rng: () => number;
}
/**
 * 深克隆状态（walls/target/def/rng 按引用共享——它们不可变或与逻辑
 * 无关；history 一并清空，专供求解器复用）。
 * @param state - 源状态。
 * @returns 克隆状态。
 */
export declare function cloneState(state: MoleculeState): MoleculeState;
/**
 * 状态的规范哈希键：关卡 + 原子（元素/位置/键）+ 主原子 id。同一布局
 * 与键结构必然产生同一键；score/moves/history 故意排除。
 * @param state - 状态。
 * @returns 规范键字符串。
 */
export declare function stateKey(state: MoleculeState): string;
/**
 * 按 id 取原子。
 * @param state - 状态。
 * @param id - 原子 id。
 * @returns 原子。
 */
export declare function atomById(state: MoleculeState, id: number): Atom;
/**
 * 取某格上的原子。
 * @param state - 状态。
 * @param r - 行。
 * @param c - 列。
 * @returns 该格原子，空格返回 null。
 */
export declare function atomAt(state: MoleculeState, r: number, c: number): Atom | null;
/**
 * 原子的剩余空价（化合价减去已耗键级总和）。
 * @param atom - 原子。
 * @returns 空价数。
 */
export declare function freeBonds(atom: Atom): number;
/**
 * 通过键关系求原子所属的连通团（原子 id 集合）。
 * @param state - 状态。
 * @param id - 起始原子 id。
 * @returns 团内全部原子 id。
 */
export declare function groupOf(state: MoleculeState, id: number): Set<number>;
/**
 * 是否全部原子连成一个团。
 * @param state - 状态。
 * @returns 连通返回 true。
 */
export declare function isConnected(state: MoleculeState): boolean;
/**
 * 是否达成目标：全部连通、全部原子价恰好饱和、元素计数与目标式一致。
 * @param state - 状态。
 * @returns 过关返回 true。
 */
export declare function isWin(state: MoleculeState): boolean;
/**
 * 死锁检测（不可恢复局面）：某原子剩余空价超过其未来可能的成键上界
 * （典型：把 C 推进只剩一格开口的死胡同），或主原子四个方向都动不了。
 * @param state - 状态。
 * @returns 死锁返回 true（已过关恒为 false）。
 */
export declare function isDeadlocked(state: MoleculeState): boolean;
/**
 * 从自定义关卡定义创建状态（内置关卡请用 createMoleculeState）。
 * @param def - 关卡定义。
 * @param seed - 随机种子。
 * @param score - 带入分数。
 * @returns 新状态。
 */
export declare function createMoleculeStateFromDef(def: MoleculeLevelDef, seed?: number, score?: number): MoleculeState;
/**
 * 创建某个内置关卡的新状态。
 * @param levelIndex - 内置关卡下标（0 起）。
 * @param seed - 随机种子（默认 1）。
 * @param score - 带入分数。
 * @returns 新状态。
 */
export declare function createMoleculeState(levelIndex?: number, seed?: number, score?: number): MoleculeState;
/**
 * 切换到某个内置关卡（分数保留，作为新关卡起点）。
 * @param state - 状态。
 * @param levelIndex - 目标关卡下标。
 */
export declare function loadLevel(state: MoleculeState, levelIndex: number): void;
/**
 * 重开当前关卡：布局与分数回滚到入关时。
 * @param state - 状态。
 */
export declare function restartLevel(state: MoleculeState): void;
/**
 * 施加一步移动：主原子（连同其团）向 dir 平移一格，路径上顶住的
 * 原子团被推一格；随后扫键。任何被推原子撞墙则整步拒绝。
 * @param state - 状态。
 * @param dir - 方向。
 * @returns 移动记录；被挡或已过关时返回 null。
 */
export declare function applyMove(state: MoleculeState, dir: Dir): MoleculeMove | null;
/**
 * 撤销上一步：原子布局、键、步数与分数完整恢复。
 * @param state - 状态。
 * @returns 撤销成功返回 true；无步可撤返回 false。
 */
export declare function undoMove(state: MoleculeState): boolean;
/**
 * 渲染装饰用：按注入 seed 确定性地重排原子绘制顺序（Fisher-Yates）。
 * 逻辑结果与 seed 无关；本函数保证同 seed 同序。
 * @param state - 状态。
 * @returns 原子 id 的一个确定性排列。
 */
export declare function shimmerOrder(state: MoleculeState): number[];
/**
 * 从主原子出发深度优先遍历键图，生成 H–O–H / H₂C=CH₂ 风格的结构串。
 * @param state - 状态。
 * @returns 结构串（未成键时只有主元素符号）。
 */
export declare function structureString(state: MoleculeState): string;
/**
 * 带节点预算的 BFS 求解器：从给定状态出发找最短过关步数。用于测试
 * 验证关卡可解性与 PAR。
 * @param state - 起始状态（不会被修改）。
 * @param budget - 最大展开节点数。
 * @returns 最短步数；预算内无解返回 -1。
 */
export declare function solve(state: MoleculeState, budget: number): number;
export {};
