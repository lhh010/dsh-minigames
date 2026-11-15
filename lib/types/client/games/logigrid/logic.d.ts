/**
 * 逻辑网格 (Einstein/斑马谜题) 纯逻辑层。
 *
 * 盘面：N 个人（行，即 1..N 号房）× 4 类属性（房子颜色/宠物/饮品/爱好），
 * 每类 N 个值，同一类内值两两不同人。格子 = (类别, 人, 值)，玩家填 ✓/✗。
 *
 * 线索引擎共 8 种模板：at(住在 N 号房)、notAt(不在 N 号房)、pet(养 Y)、
 * drink(喝 Y)、same(同一人)、adjacent(紧邻)、leftOf(正左侧)、apart(分居
 * 两侧/不同人)。全部线索对真实解为真。
 *
 * 生成器：mulberry32 注入 seed，先抽解（每类一个排列），再按模板随机生成
 * 候选线索，贪心挑选加入后解数降得最多的一条（不降即冗余、天然丢弃），
 * 用回溯求解器（约束传播 + 回溯、解数截断）验证解唯一；过早唯一时用
 * 冗余真线索补足条数，超限换种子重试。
 *
 * 本模块不触碰 DOM，全部确定性，供 render/index 与测试复用。
 */
/** 属性类别数（固定 4 类）。 */
export declare const CAT_COUNT = 4;
/** 类别下标：颜色/宠物/饮品/爱好。 */
export declare const CAT_COLOR = 0;
/** 类别下标：宠物。 */
export declare const CAT_PET = 1;
/** 类别下标：饮品。 */
export declare const CAT_DRINK = 2;
/** 类别下标：爱好。 */
export declare const CAT_HOBBY = 3;
/** 四个类别的显示名。 */
export declare const CATEGORY_LABELS: readonly ["房子颜色", "宠物", "饮品", "爱好"];
/** 房子颜色值池（取前 N 个）。 */
export declare const COLOR_VALUES: readonly ["红", "蓝", "绿", "黄", "白"];
/** 宠物值池（取前 N 个）。 */
export declare const PET_VALUES: readonly ["猫", "狗", "鱼", "鸟", "兔"];
/** 饮品值池（取前 N 个）。 */
export declare const DRINK_VALUES: readonly ["红茶", "咖啡", "牛奶", "果汁", "清水"];
/** 爱好值池（取前 N 个）。 */
export declare const HOBBY_VALUES: readonly ["下棋", "读书", "画画", "弹琴", "钓鱼"];
/** 人名池（取前 N 个，行即房号顺序）。 */
export declare const PERSON_NAMES: readonly ["艾伦", "贝拉", "卡尔", "黛西", "伊森"];
/** mulberry32 PRNG：小而快，按 seed 确定性复现。 */
export declare function mulberry32(seed: number): () => number;
/** 一个“事物”：某类别的某个值，谜题里的最小指称单位。 */
export interface Thing {
    /** 类别下标 0..3。 */
    cat: number;
    /** 类别内值下标 0..N-1。 */
    val: number;
}
/** 线索种类，对应 8 种模板。 */
export type ClueKind = 'at' | 'notAt' | 'pet' | 'drink' | 'same' | 'adjacent' | 'leftOf' | 'apart';
/** 一条线索：kind 决定语义，a/b 为涉及的事物，k 为房号（仅 at/notAt 用，1 起）。 */
export interface Clue {
    /** 模板种类。 */
    kind: ClueKind;
    /** 主事物。 */
    a: Thing;
    /** 次事物（二元模板才有，否则 null）。 */
    b: Thing | null;
    /** 房号（at/notAt 用，1 起；其余为 -1）。 */
    k: number;
}
/** 渲染一个事物的自然语言短语，如「红房子的人」「养猫的人」。 */
export declare function thingPhrase(cat: number, val: number): string;
/** 渲染线索中文文本（线索卡与测试共用）。 */
export declare function renderClue(clue: Clue): string;
/** 线索涉及的事物列表（高亮相关行列用）。 */
export declare function clueThings(clue: Clue): Thing[];
/**
 * 判定线索在给定位置下是否成立；二元模板取 posA/posB 为两事物的主人房位
 * （0 起），一元模板只看 posA。
 * @param clue - 线索。
 * @param posA - 主事物主人房位（0 起）。
 * @param posB - 次事物主人房位（0 起，一元模板忽略）。
 * @returns 是否满足。
 */
export declare function clueHolds(clue: Clue, posA: number, posB: number): boolean;
/** 计算谜题解派生的位置表：pos[cat][val] = 主人房位（0 起）。 */
export declare function solutionPositions(puzzle: Puzzle): number[][];
/** 线索的稳定去重键。 */
export declare function clueKey(clue: Clue): string;
/**
 * 约束传播到不动点：线索固化（一元截断 + 二元互相支撑过滤）+ 类内唯一性
 * （单例剔除 + 每人可覆盖检查）。原地修改 masks。
 * @param masks - 每个 (cat,val) 的可用房位位掩码，长度 4N。
 * @param clues - 线索集。
 * @param n - 人数。
 * @returns false 表示出现空域/不可覆盖，即矛盾。
 */
export declare function propagate(masks: number[], clues: readonly Clue[], n: number): boolean;
/**
 * 计数满足线索集的完备指派个数（每类一个排列），结果截断到 cap。
 * 约束传播 + 最小域回溯；用于唯一性验证与冗余判定。
 * @param clues - 线索集。
 * @param n - 人数。
 * @param cap - 截断上限（达到即返回，不再多算）。
 * @returns min(真实解数, cap)。
 */
export declare function countSolutions(clues: readonly Clue[], n: number, cap?: number): number;
/**
 * 冗余判定：把 clue 加入 clues 后解集不变则为冗余。
 * 因解集随约束单调收缩，等价于计数相等；计数用截断值比较（base 未截断时
 * 才可信，base 达到 cap 保守判不冗余）。
 * @param clues - 已有线索集。
 * @param clue - 候选线索。
 * @param n - 人数。
 * @returns 是否冗余（可丢弃）。
 */
export declare function isRedundant(clues: readonly Clue[], clue: Clue, n: number): boolean;
/** 一关的规格：人数与线索条数范围。 */
export interface LevelSpec {
    /** 人数（4 或 5）。 */
    n: number;
    /** 唯一解时的最少线索数。 */
    minClues: number;
    /** 放弃本种子重试的线索数上限。 */
    maxClues: number;
}
/** 五关递进：4×4 线索 6-10 条 → 5×5 线索 9-14 条（贪心采样下的可达区间）。 */
export declare const LEVELS: readonly LevelSpec[];
/** 取关卡规格（关卡号超过 5 循环）。 */
export declare function levelSpec(level: number): LevelSpec;
/** 生成的谜题：线索集 + 抽出的真实解 + 生效种子。 */
export interface Puzzle {
    /** 关卡号（1 起）。 */
    level: number;
    /** 人数。 */
    n: number;
    /** 线索集（解唯一）。 */
    clues: Clue[];
    /** 真实解：solution[cat][person] = 值下标。 */
    solution: number[][];
    /** 实际生效的种子（重试后可能不同于入参）。 */
    seed: number;
}
/**
 * 生成一关：同种子下确定性产出。逐种子尝试——抽解、按模板随机生成候选
 * 线索（求解器判冗余即丢弃）、逐条加入并用回溯求解器验证解唯一；线索达到
 * 上限仍未唯一或过早唯一（少于 minClues）都换种子重试。
 * @param level - 关卡号（1 起，超 5 循环）。
 * @param seed - 随机种子。
 * @returns 解唯一的谜题。
 * @throws 连续 80 个种子都失败时抛错（规格不可达）。
 */
export declare function generateLevel(level: number, seed: number): Puzzle;
/** 格标记：空。 */
export declare const MARK_EMPTY = 0;
/** 格标记：✓。 */
export declare const MARK_YES = 1;
/** 格标记：✗。 */
export declare const MARK_NO = 2;
/** 每关提示次数上限。 */
export declare const MAX_HINTS = 3;
/** 玩家对一题的操作状态（纯数据，可重建）。 */
export interface PlayerState {
    /** 本局谜题。 */
    readonly puzzle: Puzzle;
    /** 人数。 */
    readonly n: number;
    /** 平铺格标记，下标 (cat*n + p)*n + v，取 MARK_*。 */
    marks: number[];
    /** 剩余提示次数。 */
    hintsLeft: number;
    /** 是否已过关（全部自洽填满且满足全部线索）。 */
    won: boolean;
    /** 当前矛盾行（同类同人两个 ✓ 或同行全 ✗），用于高亮。 */
    conflicts: {
        cat: number;
        p: number;
    }[];
    /** 累计点击次数。 */
    moves: number;
}
/** 一次推演新落下的格。 */
export interface Deduced {
    /** 类别。 */
    cat: number;
    /** 人。 */
    p: number;
    /** 值。 */
    v: number;
    /** 落下的标记（只可能是 MARK_YES 或 MARK_NO）。 */
    mark: number;
}
/** 点击循环的结果。 */
export interface CycleResult {
    /** 本次点击后该格的标记。 */
    mark: number;
    /** 由此次点击推演落下的格（淡入动画用）。 */
    deduced: Deduced[];
    /** 是否因此产生矛盾行。 */
    contradiction: boolean;
}
/** 玩家状态里 (cat,p,v) 的平铺下标（fade 动画键）。 */
export declare function cellIndex(n: number, cat: number, p: number, v: number): number;
/** 取某格当前标记。 */
export declare function getMark(st: PlayerState, cat: number, p: number, v: number): number;
/** 新建一题的空白玩家状态。 */
export declare function createPlayerState(puzzle: Puzzle): PlayerState;
/** 过关判定：每行（同人同类）恰一个 ✓（双射自动完备），且全部线索满足。 */
export declare function checkWon(st: PlayerState): boolean;
/**
 * 点击一格：标记按 空 → ✓ → ✗ → 空 循环；随后跑推演（✓ 自动补 ✗、级联
 * 强制 ✓、矛盾检测与过关判定都在推演内完成）。
 * @returns 本次结果（新标记、推演格、是否矛盾）。
 */
export declare function cycleCell(st: PlayerState, cat: number, p: number, v: number): CycleResult;
/**
 * 请求提示：标出一个真实解中必为 ✓ 而尚未标记的格；每次消耗一次额度。
 * @returns 被标出的格；额度耗尽或已无未标 ✓ 格时返回 null。
 */
export declare function requestHint(st: PlayerState): {
    cat: number;
    p: number;
    v: number;
} | null;
/** 过关得分：关卡基础分 + 时间余量 - 提示惩罚，下限 0。 */
export declare function computeScore(level: number, seconds: number, hintsUsed: number): number;
