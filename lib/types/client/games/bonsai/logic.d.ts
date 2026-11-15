/**
 * 盆栽大师纯逻辑：程序化树木养成状态机。树 = 节点树（seed 生成主干基形），
 * 能量自根向上流动（每 tick 每节点获得基础能量 × 水分/肥料/修剪增益 × 光照
 * 展开度，再把储备以上的盈余按权重分流给子枝，最直上的子枝获顶端优势 ×1.4）；
 * 能量过阈值且子枝数 < 3 即萌发新枝（方向 = 父枝角度 ± 随机 spread，并按太阳
 * 方位角做趋光偏置）。照料四操作：浇水（每日 1 次额度，生长 ×2 持续 1 游戏日，
 * 超量浇水烂根，烂根 3 次树死）、修剪（剪掉整棵子树，其能量转给兄弟枝，剪得越
 * 狠剩余枝生长越快）、光照（太阳方位 ∈ [-1,1] 拖动改变）、施肥（库存 3 袋，
 * 全体生长 +50% 持续 1 游戏日）。评分 = 树冠轮廓与目标树型的网格 IoU ×40 +
 * 密度 ×25 + 健康 ×25 + 高度区间 ×10，≥70 过关；共 5 关（圆锥/层云/斜干/双干/
 * 悬崖）。全部为确定性纯函数（随机走注入 seed 的 mulberry32），无 DOM、无计时器。
 */
/** 一关的目标树型。 */
export type ShapeKind = 'cone' | 'cloud' | 'slant' | 'twin' | 'cascade';
/** 一关的难度与评分参数。 */
export interface BonsaiLevel {
    /** 中文树型名（HUD 展示）。 */
    name: string;
    /** 目标轮廓种类。 */
    shape: ShapeKind;
    /** 目标冠幅半宽（px，局部坐标，x 相对树根）。 */
    crownW: number;
    /** 目标冠幅高度（px，局部坐标，y 向上，自土面起）。 */
    crownH: number;
    /** 冠顶高度下限（高度因子满分区间的下沿）。 */
    minH: number;
    /** 冠顶高度上限（高度因子满分区间的上沿）。 */
    maxH: number;
    /** 目标叶片数（密度因子的满分数）。 */
    targetLeaves: number;
}
/** 5 关递进：圆锥 → 层云 → 斜干 → 双干 → 悬崖。 */
export declare const LEVELS: BonsaiLevel[];
/** 一个游戏日包含的 tick 数（tick 自动推进游戏日）。 */
export declare const DAY_TICKS = 24;
/** index 层逻辑 tick 间隔（毫秒）。 */
export declare const TICK_MS = 240;
/** 每 tick 每节点基础能量。 */
export declare const BASE_ENERGY = 1;
/** 光照展开度系数：增益 = 1 + LIGHT_K × min(1, |x| / SPREAD_REF)。 */
export declare const LIGHT_K = 0.5;
/** 展开度饱和参考（px）。 */
export declare const SPREAD_REF = 120;
/** 顶端优势加成：父枝最直上的子枝能量增益 ×1.4。 */
export declare const UPRIGHT_BONUS = 1.4;
/** 节点能量储备下限：储备以上的盈余才向子枝分流。 */
export declare const FLOW_RESERVE = 4;
/** 每 tick 分流给子枝的盈余份额。 */
export declare const FLOW_RATE = 0.5;
/** 萌发所需能量阈值。 */
export declare const SPROUT_ENERGY = 10;
/** 萌发时父枝支付的能量成本。 */
export declare const SPROUT_COST = 6;
/** 单节点子枝数上限。 */
export declare const MAX_CHILDREN = 3;
/** 新枝方向随机 spread（弧度）。 */
export declare const SPROUT_SPREAD = 0.5;
/** 趋光偏置系数：新枝角度向太阳方位偏置 sunAngle × PHOTO_K 弧度。 */
export declare const PHOTO_K = 0.35;
/** 偏角绝对值上限（弧度，约 77°）。 */
export declare const ANGLE_LIMIT = 1.35;
/** 新枝初始长度（px）。 */
export declare const INITIAL_LEN = 8;
/** 每 tick 枝长微伸速率（px，乘生长增益）。 */
export declare const EXTEND_RATE = 0.12;
/** 单节枝长上限（px）。 */
export declare const MAX_LEN = 52;
/** 修剪增益：pruneMult = 1 + PRUNE_K × 累计剪除比例（封顶 PRUNE_MAX）。 */
export declare const PRUNE_K = 0.6;
/** 修剪增益封顶。 */
export declare const PRUNE_MAX = 2.5;
/** 施肥开局库存（袋）。 */
export declare const FERT_STOCK = 3;
/** 施肥生长倍率。 */
export declare const FERT_MULT = 1.5;
/** 浇水生长倍率。 */
export declare const WATER_MULT = 2;
/** 每次烂根的健康损失。 */
export declare const ROT_HEALTH = 34;
/** 烂根次数上限：达到即树死。 */
export declare const ROT_LIMIT = 3;
/** 每 tick 健康自然恢复。 */
export declare const HEALTH_REGEN = 1;
/** 过关分数线。 */
export declare const SCORE_PASS = 70;
/** 评分离散网格：局部坐标范围与格宽（IoU 近似用）。 */
export declare const GRID_X0 = -180;
export declare const GRID_Y0 = -380;
export declare const GRID_X1 = 180;
export declare const GRID_Y1 = 40;
export declare const GRID_CELL = 10;
/** 树根在逻辑画布上的锚点（渲染层与交互层共用）。 */
export declare const ROOT_X = 480;
export declare const SOIL_Y = 560;
/** 树的一个节点（一节枝）。 */
export interface BonsaiNode {
    /** 唯一 id（创建顺序递增，父节点 id 恒小于子节点）。 */
    id: number;
    /** 父节点 id；根为 null。 */
    parentId: number | null;
    /** 子节点 id 列表。 */
    children: number[];
    /** 深度（根为 0）。 */
    depth: number;
    /** 绝对分枝角（弧度，0 = 竖直向上，右正左负）。 */
    angle: number;
    /** 本节枝长（px，逐 tick 微伸）。 */
    length: number;
    /** 当前能量。 */
    energy: number;
}
/** 一局阶段：playing 进行 / won 过关 / dead 树枯死。 */
export type BonsaiPhase = 'playing' | 'won' | 'dead';
/** 一局状态。 */
export interface BonsaiState {
    phase: BonsaiPhase;
    /** 0 起的关卡下标。 */
    levelIndex: number;
    /** 当前游戏日（1 起）。 */
    day: number;
    /** 今天已流逝的 tick 数。 */
    dayTicks: number;
    /** 开局以来的总 tick 数。 */
    tickTotal: number;
    /** 全部存活节点（含根，id 升序）。 */
    nodes: BonsaiNode[];
    /** 下一个分配节点 id。 */
    nextId: number;
    /** 今日浇水额度（每日开始时重置为 1）。 */
    waterQuota: number;
    /** 浇水增益剩余游戏日（>0 时生长 ×2）。 */
    waterBoostDays: number;
    /** 肥料库存。 */
    fertStock: number;
    /** 施肥增益剩余游戏日（>0 时生长 ×1.5）。 */
    fertBoostDays: number;
    /** 太阳方位 ∈ [-1,1]（-1 正左，0 正上，1 正右），驱动趋光性。 */
    sunAngle: number;
    /** 修剪增益倍率（≥1，剪除越多越大，封顶 PRUNE_MAX）。 */
    pruneMult: number;
    /** 累计剪除节点占累计总节点数的比例（修剪增益的依据）。 */
    prunedFraction: number;
    /** 烂根次数。 */
    rotCount: number;
    /** 健康度 0-100（烂根扣分，逐 tick 自然恢复）。 */
    health: number;
    /** 最近一次评分总分（HUD 与 onScore 上报）。 */
    lastScore: number;
    /** 注入的随机源（萌发方向专用，每 tick 至多每节点一次）。 */
    rng: () => number;
}
/** 评分四因子合成结果。 */
export interface BonsaiScore {
    /** 树冠轮廓与目标树型的网格 IoU 近似 ∈ [0,1]。 */
    iou: number;
    /** 密度：叶片数 / 目标叶片数（封顶 1）。 */
    density: number;
    /** 健康因子：health / 100。 */
    health: number;
    /** 高度区间因子 ∈ [0,1]。 */
    height: number;
    /** 总分 = iou×40 + density×25 + health×25 + height×10（0-100 取整）。 */
    total: number;
    /** 是否达到过关线 SCORE_PASS。 */
    passed: boolean;
}
/**
 * mulberry32 确定性伪随机数发生器（与 farm/burger 同构造）。
 * @param seed - 32 位种子。
 * @returns 返回 [0,1) 随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/**
 * 创建一关初始状态：单根主干（无随机消耗，全部随机性发生在 tick 内）。
 * @param seed - 注入的随机种子，同种子逐局可复现。
 * @param levelIndex - 0 起的关卡下标（越界钳到最后一关）。
 * @returns 就绪的 BonsaiState（phase='playing'）。
 */
export declare function createBonsaiState(seed: number, levelIndex: number): BonsaiState;
/**
 * 每节点末端位置（局部坐标：树根为原点，y 向上）。父节点 id 恒小于子节点，
 * 按数组顺序单遍即可求出。
 * @param state - 游戏状态。
 * @returns 节点 id → 末端位置。
 */
export declare function nodeEndPositions(state: BonsaiState): Map<number, {
    x: number;
    y: number;
}>;
/**
 * 当前生长总倍率：浇水 × 施肥 × 修剪增益合成。
 * @param state - 游戏状态。
 * @returns ≥1 的生长倍率。
 */
export declare function growthMult(state: BonsaiState): number;
/**
 * 某节点本 tick 的能量增益：基础能量 × 生长倍率 × 光照展开度（越外越晒）
 * × 顶端优势（父枝最直上子枝 ×UPRIGHT_BONUS）。供 tickBonsai 与测试共用。
 * @param state - 游戏状态。
 * @param node - 目标节点。
 * @returns 本 tick 应获得的能量。
 */
export declare function nodeGain(state: BonsaiState, node: BonsaiNode): number;
/**
 * 推进一个逻辑 tick：计时/翻页 → 能量增益（基础 × 倍率 × 光照 × 顶端优势）
 * → 能量自根向上分流（储备以上盈余按 1 / 1.4 权重给子枝）→ 萌发新枝（阈值
 * + 子数上限 + 随机 spread + 趋光偏置）→ 枝长微伸 → 健康恢复。翻页时评分。
 * @param state - 游戏状态（原地突变）。
 */
export declare function tickBonsai(state: BonsaiState): void;
/**
 * 立即推进 1 个游戏日（空格键）：翻页、重置浇水额度、衰减增益并评分。
 * @param state - 游戏状态。
 * @returns 是否成功推进（非 playing 阶段返回 false）。
 */
export declare function advanceDay(state: BonsaiState): boolean;
/**
 * 浇水：有今日额度则消耗之并获得 1 游戏日 ×2 生长增益；额度已尽再浇即烂根
 * （健康 -ROT_HEALTH，烂根达 ROT_LIMIT 次树死）。
 * @param state - 游戏状态。
 * @returns 'watered' 浇上 / 'rotted' 烂根 / 'rotted-dead' 烂根致死 / 'not-playing'。
 */
export declare function water(state: BonsaiState): 'watered' | 'rotted' | 'rotted-dead' | 'not-playing';
/**
 * 施肥：消耗 1 袋库存，全体生长 ×FERT_MULT 持续 1 游戏日。
 * @param state - 游戏状态。
 * @returns 'fertilized' / 'empty' 库存耗尽 / 'not-playing'。
 */
export declare function fertilize(state: BonsaiState): 'fertilized' | 'empty' | 'not-playing';
/**
 * 修剪：剪掉目标节点的整棵子树（根节点不可剪），被剪子树的能量全部转给
 * 其父枝的剩余子枝（兄弟枝），并按累计剪除比例提升全局修剪增益。
 * @param state - 游戏状态。
 * @param nodeId - 待剪节点 id。
 * @returns 实际剪除的节点数（非法目标返回 0）。
 */
export declare function pruneNode(state: BonsaiState, nodeId: number): number;
/**
 * 设置太阳方位（拖动太阳）。
 * @param state - 游戏状态。
 * @param value - 目标方位，钳制到 [-1,1]。
 */
export declare function setSun(state: BonsaiState, value: number): void;
/**
 * 目标树型轮廓判定（局部坐标，树根为原点，y 向上）。
 * @param level - 关卡参数。
 * @param x - 局部横坐标。
 * @param y - 局部纵坐标（向上为正，土面为 0）。
 * @returns 该点是否在目标树冠轮廓内。
 */
export declare function isInsideTarget(level: BonsaiLevel, x: number, y: number): boolean;
/**
 * 评分：轮廓匹配（树冠与目标树型在固定网格上的 IoU 近似）×40 + 密度
 * （叶片数 / 目标叶片数）×25 + 健康 ×25 + 高度区间 ×10，≥ SCORE_PASS 过关。
 * @param state - 游戏状态。
 * @returns 四因子与总分合成结果。
 */
export declare function scoreBonsai(state: BonsaiState): BonsaiScore;
/**
 * 树结构快照（深拷贝，可 JSON 序列化）：长 tick 重放确定性对比用。
 * @param state - 游戏状态。
 * @returns 节点数组快照（含子 id 列表副本）。
 */
export declare function snapshotTree(state: BonsaiState): BonsaiNode[];
