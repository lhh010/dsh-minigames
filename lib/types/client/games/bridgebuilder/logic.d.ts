/**
 * 建桥大师 Bridge Builder 纯逻辑：侧视峡谷上的节点—杆件结构求解器。
 * 玩家在整数网格上从两岸锚点向外放置钢梁（按长度计费、受预算约束），
 * 建好后进入测试：小车从左岸驶过，结构按质量—弹簧模型演化（弹簧 +
 * 沿轴阻尼 + 半隐式欧拉，固定 1/240s 子步），杆件应变超过断裂阈值即
 * 断裂并可连锁传播；车达右岸过关，车坠谷底失败。全部函数为纯函数或
 * 确定性状态机（不触碰 DOM / 计时器 / Math.random），同输入必得同一
 * 结果，可离线单测。
 */
/**
 * mulberry32 确定性伪随机数生成器（本游戏物理不随机，仅派生视觉杂波
 * 与测试数据）。
 * @param seed - 32 位整数种子。
 * @returns 返回 [0, 1) 区间随机数的函数；同种子必产出同一序列。
 */
export declare function mulberry32(seed: number): () => number;
/** 一个网格节点（整数格坐标；y 向下增大，0 为网格顶）。 */
export interface BridgeNode {
    /** 列（0 起，向右增大）。 */
    x: number;
    /** 行（0 起，向下增大；锚点所在行为路面行）。 */
    y: number;
}
/** 一关的完整定义（手工模板，五关递进）。 */
export interface BridgeLevel {
    /** 关卡名（HUD 显示）。 */
    name: string;
    /** 网格列数（x 上界为 cols-1）。 */
    cols: number;
    /** 网格行数（y 上界为 rows-1；路面行之下是峡谷）。 */
    rows: number;
    /** 左岸锚点（固定支座，路面行上）。 */
    leftAnchor: BridgeNode;
    /** 右岸锚点（固定支座，路面行上）。 */
    rightAnchor: BridgeNode;
    /** 中立柱顶端锚点（固定支座，从谷底升起，供下方支撑）。 */
    pillars: BridgeNode[];
    /** 本关预算（杆件总成本不得超过它）。 */
    budget: number;
}
/** 一根已放置的钢梁：两端网格节点（无序）。 */
export interface BridgeBeam {
    /** 端点 A。 */
    a: BridgeNode;
    /** 端点 B。 */
    b: BridgeNode;
}
/** 网格单元边长（逻辑像素）。 */
export declare const CELL = 40;
/** 单位长度造价（每格 10，斜梁按欧氏长度取整）。 */
export declare const BEAM_UNIT_COST = 10;
/** 杆件最大格距（欧氏长度；≤2 覆盖直邻 / 对角 / 跨二）。 */
export declare const MAX_BEAM_LEN = 2.9;
/** 断裂应变阈值：|len-rest|/rest 超过它杆件即断。 */
export declare const BREAK_STRAIN = 0.35;
/** 固定物理子步（秒）。 */
export declare const SUB_DT: number;
/** 车轮半径（逻辑像素）。 */
export declare const WHEEL_R = 8;
/** 车轮间距（逻辑像素）。 */
export declare const WHEEL_BASE = 30;
/** 单次测试最长模拟秒数。 */
export declare const MAX_RUN_SECONDS = 20;
/**
 * 节点序列化键（网格坐标 → 唯一字符串）。
 * @param n 网格节点。
 */
export declare function nodeKey(n: BridgeNode): string;
/**
 * 解析节点键（nodeKey 的逆函数；非法键返回 null）。
 * @param key 形如 "x,y" 的键。
 */
export declare function parseNodeKey(key: string): BridgeNode | null;
/**
 * 杆件造价：按两端欧氏格距 × 单价向上取整（最近杆最便宜）。
 * @param a 端点 A。
 * @param b 端点 B。
 */
export declare function beamCost(a: BridgeNode, b: BridgeNode): number;
/**
 * 已放置杆件的总造价。
 * @param beams 杆件列表。
 */
export declare function totalCost(beams: readonly BridgeBeam[]): number;
/**
 * 建造网格判定：节点是否在可建区（两锚点列之间、网格顶到路面行）。
 * @param level 关卡定义。
 * @param n 待查节点。
 */
export declare function inBuildGrid(level: BridgeLevel, n: BridgeNode): boolean;
/**
 * 是否固定支座（左 / 右岸锚点或中立柱顶）。
 * @param level 关卡定义。
 * @param n 待查节点。
 */
export declare function isAnchor(level: BridgeLevel, n: BridgeNode): boolean;
/**
 * 已有结构占据的节点键集合（所有杆件端点）。
 * @param beams 杆件列表。
 */
export declare function structureNodes(beams: readonly BridgeBeam[]): Set<string>;
/** 放置校验失败原因。 */
export type PlaceReject = 'grid' | 'length' | 'duplicate' | 'budget' | 'connect';
/**
 * 杆件放置合法性：两端都在可建网格内、欧氏格距不超过上限、不与已有
 * 杆件重复、造价不超预算、且至少一端落在支座或已有结构上（禁止凭空
 * 悬浮杆，保证结构从锚点连通生长）。
 * @param level 关卡定义。
 * @param beams 已放置杆件。
 * @param a 端点 A。
 * @param b 端点 B。
 * @returns 合法返回 null；否则返回失败原因。
 */
export declare function placeReject(level: BridgeLevel, beams: readonly BridgeBeam[], a: BridgeNode, b: BridgeNode): PlaceReject | null;
/** 模拟节点（质量点）。 */
interface SimNode {
    x: number;
    y: number;
    vx: number;
    vy: number;
    pinned: boolean;
}
/** 模拟杆件（弹簧，两端为 SimNode 下标）。 */
interface SimBeam {
    ai: number;
    bi: number;
    rest: number;
    broken: boolean;
}
/** 车轮（质量点 + 目标纵向速度）。 */
interface SimWheel {
    x: number;
    y: number;
    vx: number;
    vy: number;
}
/** 单次测试的运行时世界。 */
export interface RunWorld {
    /** 全部质量点（前若干个为 pinned 支座）。 */
    nodes: SimNode[];
    /** 全部弹簧杆件。 */
    beams: SimBeam[];
    /** 两个车轮（前轮在后）。 */
    wheels: SimWheel[];
    /** 已模拟秒数。 */
    t: number;
    /** running / won（车到右岸）/ failed（车坠谷或超时）。 */
    outcome: 'running' | 'won' | 'failed';
    /** 本子步新断裂杆件下标（渲染转粒子后清空）。 */
    newBreaks: number[];
    /** 全程最大应力比（0 起，≥1 即有杆断裂）。 */
    maxStress: number;
    /** 已断裂杆件数。 */
    brokenCount: number;
    /** 过关横坐标（右锚点再往右一点）。 */
    goalX: number;
    /** 坠谷失败纵坐标。 */
    failY: number;
    /** 左岸崖面右边界（其左为实地的路面行）。 */
    groundLX: number;
    /** 右岸崖面左边界（其右为实地的路面行）。 */
    groundRX: number;
    /** 路面行纵坐标（两岸实地高度）。 */
    deckY: number;
    /** 路面行杆件下标（车轮只与它们碰撞；其余为支撑杆）。 */
    deckBeams: number[];
}
/**
 * 由蓝图构造测试世界：支座节点钉死，杆件按静止几何建立，车轮放在左
 * 锚点上方。
 * @param level 关卡定义。
 * @param beams 玩家蓝图杆件。
 */
export declare function createRunWorld(level: BridgeLevel, beams: readonly BridgeBeam[]): RunWorld;
/**
 * 杆件当前应变应力比：|len-rest| / (rest × BREAK_STRAIN)。0 = 完全
 * 松弛，1 = 达到断裂阈值，≥1 即断。
 * @param world 运行世界。
 * @param beam 杆件下标。
 */
export declare function stressRatio(world: RunWorld, beam: number): number;
/**
 * 胡克弹簧轴向力（含沿轴阻尼），供测试直接校验力学。
 * @param rest 静止长度。
 * @param len 当前长度。
 * @param relVel 两端沿轴相对速度（伸长为正）。
 * @returns 轴向力（正 = 拉伸内力）。
 */
export declare function springForce(rest: number, len: number, relVel: number): number;
/**
 * 是否达到断裂条件：应力比 ≥ 1。
 * @param ratio stressRatio 的返回值。
 */
export declare function shouldBreak(ratio: number): boolean;
/**
 * 推进一个固定子步（1/240s）：车轮驱动 + 接触 → 弹簧内力 → 积分 →
 * 断裂传播 → 胜负判定。确定性：无随机、固定遍历顺序。
 * @param world 运行世界（就地更新）。
 */
export declare function stepRun(world: RunWorld): void;
/**
 * 一次性跑完整场测试（确定性）：步进到出胜负或步数上限。
 * @param level 关卡定义。
 * @param beams 玩家蓝图。
 * @param maxSubsteps 子步上限（默认 20s × 240）。
 * @returns 结束后的世界快照（含 outcome / brokenCount / maxStress）。
 */
export declare function simulateRun(level: BridgeLevel, beams: readonly BridgeBeam[], maxSubsteps?: number): RunWorld;
/** 路面行（所有关卡统一，y=6）。 */
export declare const DECK_ROW = 6;
/** 谷底行（渲染用；y=10 以下为深渊）。 */
export declare const FLOOR_ROW = 10;
/** 五关模板：间隙 6 → 11 格，中立柱 1 → 0 根，预算按难度收紧。 */
export declare const LEVELS: readonly BridgeLevel[];
/**
 * 取关卡定义（越界收敛到首 / 末关）。
 * @param index 0 起的关卡下标。
 */
export declare function levelFor(index: number): BridgeLevel;
/**
 * 过关得分：关卡基础分 + 剩余预算（省钱有奖励）。
 * @param levelIndex 0 起关卡下标。
 * @param beams 玩家蓝图（计算造价）。
 */
export declare function scoreFor(levelIndex: number, beams: readonly BridgeBeam[]): number;
export {};
