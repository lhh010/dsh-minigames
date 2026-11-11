/**
 * 一笔画 (One Stroke / Euler path) 纯逻辑：给定平面图（节点 + 边），玩家
 * 从任一点起笔沿边移动，每条边恰好经过一次；生成器保证图永远可解——
 * 先在网格点上建随机生成树，再添加不交叉的弦补足边数，最后用「断一条
 * 接一条」的换边操作把奇点数收敛到目标（0 或 2），换边不改变边数、不
 * 破坏连通性，也不引入交叉。
 *
 * 状态以不可变值更新（新 Set / 新数组），便于渲染快照与单元测试。
 */
/** 五个关卡的配置：边数 8→20 递进，奇点数 0/2 交替。 */
export interface OneStrokeLevel {
    /** 目标边数。 */
    edges: number;
    /** 目标奇点数（0 = 欧拉回路，2 = 欧拉路径）。 */
    odd: 0 | 2;
}
export declare const LEVELS: readonly OneStrokeLevel[];
/** 平面坐标点（网格单元坐标）。 */
export interface Point {
    x: number;
    y: number;
}
/** 一条边：节点数组下标，规范化为 a < b。 */
export interface Edge {
    a: number;
    b: number;
}
/** 一张平面图。 */
export interface OneStrokeGraph {
    nodes: Point[];
    edges: Edge[];
}
/** 一局状态：at 为 null 表示尚未起笔。 */
export interface StrokeState {
    graph: OneStrokeGraph;
    /** 笔尖所在节点；null = 未起笔。 */
    at: number | null;
    /** 依次经过的节点（起笔节点为 path[0]）。 */
    path: number[];
    /** 已画过的边（edgeKey 集合）。 */
    drawn: ReadonlySet<string>;
}
/** 一次移动的判定结果；ok 为 false 时给出原因。 */
export type MoveResult = {
    ok: true;
    state: StrokeState;
} | {
    ok: false;
    reason: 'not-started' | 'not-adjacent' | 'edge-drawn';
};
/** mulberry32 伪随机数发生器：同 seed 序列完全一致，可注入测试。 */
export declare function mulberry32(seed: number): () => number;
/** 边的规范化键（与端点顺序无关）。 */
export declare function edgeKey(a: number, b: number): string;
/**
 * 两条线段是否互相阻挡（不可共存）：端点相同时允许（都接在同一节点），
 * 否则出现真交叉、内点相切或共线重叠即视为阻挡。
 * @param a1 - 线段一端点 1。
 * @param a2 - 线段一端点 2。
 * @param b1 - 线段二端点 1。
 * @param b2 - 线段二端点 2。
 */
export declare function segmentsBlock(a1: Point, a2: Point, b1: Point, b2: Point): boolean;
/** 每个节点的度数数组。 */
export declare function degrees(graph: OneStrokeGraph): number[];
/** 奇点（度为奇数的节点）下标列表。 */
export declare function oddNodes(graph: OneStrokeGraph): number[];
/** 图是否连通（忽略无边孤立点；生成器产出的图每个节点都在树上）。 */
export declare function isConnected(graph: OneStrokeGraph): boolean;
/** 欧拉路径存在判定：连通且奇点数为 0 或 2。 */
export declare function hasEulerPath(graph: OneStrokeGraph): boolean;
/**
 * 生成一张保证可解的一笔画平面图：逐次以派生种子调用 {@link buildOnce}
 * 并校验（边数恰为目标、奇点数恰为目标，欧拉路径随之成立）；同种子
 * 序列确定，结果逐字段一致。
 * @param seed - 种子；同种子产出完全相同的图。
 * @param targetEdges - 目标边数（结果恰等于该值）。
 * @param oddTarget - 目标奇点数 0 或 2（结果恰等于该值）。
 */
export declare function generateGraph(seed: number, targetEdges: number, oddTarget: 0 | 2): OneStrokeGraph;
/** 关卡图：seed 由关卡号派生，同关卡重开得到完全相同的图。 */
export declare function levelGraph(level: number): OneStrokeGraph;
/** 一局的初始状态（未起笔）。 */
export declare function initialState(graph: OneStrokeGraph): StrokeState;
/** 从 node 节点起笔，返回新状态。 */
export declare function startAt(state: StrokeState, node: number): StrokeState;
/** 当前笔尖的合法目标（相邻且未画过的节点）。 */
export declare function legalTargets(state: StrokeState): number[];
/**
 * 尝试沿边移动到 to：需已起笔、与笔尖相邻且该边未画过；重复走已画的边
 * 返回 'edge-drawn'（对局失败，界面提示重开）。
 */
export declare function tryMove(state: StrokeState, to: number): MoveResult;
/** 节点的剩余度：总度数减去已画过的相邻边数（提示模式的教育信息）。 */
export declare function remainingDegree(state: StrokeState, node: number): number;
/** 是否画完全部边（过关判定）。 */
export declare function isComplete(state: StrokeState): boolean;
/** 是否走进死点：已起笔、未画完且无任何合法移动。 */
export declare function isStuck(state: StrokeState): boolean;
