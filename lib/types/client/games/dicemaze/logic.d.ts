/**
 * 骰子行军（DiceMaze）纯逻辑：标准骰子（对面点数和为 7）的翻滚朝向
 * 变换、数字门 / 碎地板 / 终点判定，以及带种子（mulberry32）的关卡生成。
 *
 * 生成策略保证可解：先以偏向终点的随机游走铺出一条起点→终点的解路径，
 * 再沿解路径按骰子到达那一刻的顶面撒数字门（门数字 = 解路径进入时的
 * 顶面，照解走必然全开），终点数字 = 进入终点时的顶面。岔路是纯死胡
 * 同（每个新格子只有一个非墙邻居），不会绕过门，因此解路径是唯一通
 * 路，确定性重放必然通关。无 DOM、无全局状态；同一种子逐位一致。
 */
/** 四个翻滚方向（也是棋盘行进方向）。 */
export type Dir = 'up' | 'right' | 'down' | 'left';
/** 骰子朝向三元组：顶 / 北 / 东三面的点数（各 1-6，对面和为 7）。 */
export interface Orientation {
    top: number;
    north: number;
    east: number;
}
/** 初始朝向：1 朝上、2 朝北、3 朝东。 */
export declare const START_ORIENTATION: Orientation;
/**
 * 朝指定方向翻滚 90° 后的新朝向。
 * 翻向北：顶→北、南→顶；翻向南：北→顶、顶→南；
 * 翻向东：顶→东、西→顶；翻向西：东→顶、顶→西（对面和恒为 7）。
 * @param o 翻滚前的朝向。
 * @param dir 翻滚（行进）方向。
 * @returns 翻滚后的新朝向（新对象）。
 */
export declare function roll(o: Orientation, dir: Dir): Orientation;
/** 格子类型码（kind 数组取值）。 */
export declare const KIND_WALL = 0;
export declare const KIND_FLOOR = 1;
export declare const KIND_DOOR = 2;
export declare const KIND_CRACK = 3;
export declare const KIND_START = 4;
export declare const KIND_GOAL = 5;
/**
 * 一张关卡地图：kind 每格类型码，num 为门 / 终点数字（0 表示无），
 * solution 是生成时的解路径方向序列（从起点逐步翻到终点）。
 */
export interface Board {
    w: number;
    h: number;
    kind: Uint8Array;
    num: Uint8Array;
    /** 起点格。 */
    start: {
        x: number;
        y: number;
    };
    /** 终点格。 */
    goal: {
        x: number;
        y: number;
    };
    /** 进入终点时必须恰好朝上的顶面点数。 */
    goalNum: number;
    /** 解路径（保证逐方向执行 tryMove 最终 won）。 */
    solution: Dir[];
}
/** 关卡尺寸：L1 9×7，每级 +2×2，L5 17×15（外圈为墙）。 */
export declare function levelSize(level: number): {
    w: number;
    h: number;
};
/**
 * 生成一关：解路径随机游走 → 撒门（按解路径到达顶面）→ 死胡同岔路 →
 * 岔路尖端碎地板 → 终点数字。游走失败时换种子重试（确定性不变）。
 * @param seed RNG 种子。
 * @param level 关卡号（1-5，越界按边界截断）。
 * @returns 完整地图（含解路径与终点数字）。
 */
export declare function generateLevel(seed: number, level: number): Board;
/** 一局进行时状态（可变；历史快照支持撤回）。 */
export interface GameState {
    board: Board;
    /** 骰子当前格。 */
    x: number;
    y: number;
    /** 骰子当前朝向。 */
    orient: Orientation;
    /** 已走步数。 */
    steps: number;
    /** 碎地板破坏标记（1 = 已碎，不可再入）。 */
    broken: Uint8Array;
    /** 是否已通关。 */
    won: boolean;
    /** 撤回快照栈（每步一次，最多 200）。 */
    history: {
        x: number;
        y: number;
        orient: Orientation;
        steps: number;
        broken: Uint8Array;
    }[];
}
/** 从地图创建初始局面（骰子在起点、初始朝向）。 */
export declare function createState(board: Board): GameState;
/**
 * 能否朝 dir 翻滚一格：界内、非墙、碎而未修的地板不可再入、数字门要
 * 求翻滚后的顶面恰好等于门数字。
 * @returns true 表示该方向可走。
 */
export declare function canEnter(state: GameState, dir: Dir): boolean;
/** 一次尝试翻滚的结果。 */
export type MoveResult = 'moved' | 'blocked' | 'won';
/**
 * 朝 dir 翻滚一格：成功则推进（进入碎地板即标记破坏、步数 +1、压入撤
 * 回快照），到达终点且顶面等于终点数字时置 won 并返回 'won'。
 * @returns 'blocked' 不可走（含已通关后的输入）；'moved' 普通前进；'won' 通关。
 */
export declare function tryMove(state: GameState, dir: Dir): MoveResult;
/**
 * 撤回上一步：恢复位置、朝向、步数与碎地板状态，并清除通关标记。
 * @returns true 表示撤回成功；false 表示没有可撤回的步。
 */
export declare function undo(state: GameState): boolean;
