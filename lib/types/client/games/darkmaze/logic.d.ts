/**
 * 手电迷宫（DarkMaze）纯逻辑：种子确定性迷宫生成（迭代式递归回溯）、
 * 金币 / 陷阱 / 电池道具布点、扇形光锥可见性（含格点射线遮挡简化）、
 * 探索记忆集合、移动 / 拾取 / 陷阱 / 过关判定与 0.5s 全图闪现补偿。
 * 全部随机走注入 seed（mulberry32），同 seed 重放结果完全一致；无 DOM。
 */
/** 墙位比特：每格记录「开通」的方向通道（与 maze 游戏同约定）。 */
export declare const DN = 1;
export declare const DE = 2;
export declare const DS = 4;
export declare const DW = 8;
/** 方向名（与移动键一一对应）。 */
export type DarkDir = 'up' | 'right' | 'down' | 'left';
/** mulberry32：小型确定性 32 位 PRNG。
 * @param seed 种子（任意整数，内部取无符号 32 位）
 * @returns 返回 [0,1) 均匀随机数的函数
 */
export declare function mulberry32(seed: number): () => number;
/** 完美迷宫（w×h 格，墙为开通位掩码，行优先 y*w+x）。 */
export interface DarkMaze {
    w: number;
    h: number;
    walls: Uint8Array;
}
/** 用迭代式递归回溯生成完美迷宫；同 seed → 同位掩码。
 * @param seed 确定性种子
 * @param w 列数（≥ 3，向下钳制）
 * @param h 行数（≥ 3，向下钳制）
 * @returns 每格恰有一条通路的生成树迷宫
 */
export declare function generateDarkMaze(seed: number, w: number, h: number): DarkMaze;
/** (x,y) 格能否朝 dir 走一步（共享墙开通且不出界）。
 * @param maze 迷宫
 * @param x 当前列
 * @param y 当前行
 * @param dir 方向名
 * @returns 可走为 true
 */
export declare function darkCanMove(maze: DarkMaze, x: number, y: number, dir: DarkDir): boolean;
/** 单关参数：尺寸 / 陷阱数 / 金币数 / 电池数 / 手电基础半径（格）。 */
export interface DarkLevelConfig {
    size: number;
    traps: number;
    coins: number;
    batteries: number;
    radius: number;
}
/** 取第 level 关参数（level 钳制到 1..5，越界取端点）。
 * @param level 1 起的关卡号
 * @returns 该关的尺寸与道具配置
 */
export declare function levelConfig(level: number): DarkLevelConfig;
/** 光锥半张角（±60°）。 */
export declare const HALF_CONE: number;
/** 全图闪现时长（毫秒）。 */
export declare const FLASH_MS = 500;
/** 每颗电池补充的手电半径（格）。 */
export declare const BATTERY_BOOST = 1.5;
/** 手电半径上限（格）。 */
export declare const MAX_RADIUS = 5;
/** 初始生命。 */
export declare const START_LIVES = 3;
/** 盘面道具（taken = 已拾取 / 已触发）。 */
export interface DarkItem {
    x: number;
    y: number;
    taken: boolean;
}
/** 一局单关的完整可玩状态。 */
export interface DarkMazeState {
    maze: DarkMaze;
    /** 1 起的关卡号。 */
    level: number;
    player: {
        x: number;
        y: number;
    };
    exit: {
        x: number;
        y: number;
    };
    coins: DarkItem[];
    traps: DarkItem[];
    batteries: DarkItem[];
    /** 手电朝向（弧度，0 = 东，正角向下/南）。 */
    facing: number;
    lives: number;
    coinsCollected: number;
    steps: number;
    /** 探索记忆：见过（光锥照到或踩过）的格子索引集合。 */
    memory: Set<number>;
    /** 全图闪现剩余毫秒（>0 期间整张图可见）。 */
    flashMs: number;
    /** 电池累计补光（格）。 */
    radiusBoost: number;
    status: 'playing' | 'cleared' | 'gameover';
}
/** 当前生效的手电半径（基础 + 电池，封顶 MAX_RADIUS）。
 * @param state 当前状态
 * @returns 半径（格）
 */
export declare function effectiveRadius(state: DarkMazeState): number;
/** 从 from 格中心到 to 格中心的连线是否通畅（格点射线简化：相邻格查墙，
 * 恰好跨角的斜跳放行）。
 * @param maze 迷宫
 * @param from 起点格
 * @param to 终点格
 * @returns 无墙阻挡为 true
 */
export declare function hasLineOfSight(maze: DarkMaze, from: {
    x: number;
    y: number;
}, to: {
    x: number;
    y: number;
}): boolean;
/** 扇形光锥可见格集合：以 origin 为顶点、朝 facing ±60°、半径 radius 格，
 * 中心距超界或角度超界或射线被墙截断的格子不可见；自身格恒可见。
 * @param maze 迷宫
 * @param origin 玩家格
 * @param facing 朝向弧度
 * @param radius 半径（格）
 * @returns 可见格索引集合（y*w+x）
 */
export declare function visibleCells(maze: DarkMaze, origin: {
    x: number;
    y: number;
}, facing: number, radius: number): Set<number>;
/** 创建一关初始状态：生成迷宫、布道具、朝向指向出口、记忆 = 初始光锥。
 * @param seed 确定性种子（同 seed + 同 level → 完全同盘）
 * @param level 关卡号（1..5，越界钳制）
 * @param lives 初始生命（默认 START_LIVES；跨关沿用上一关剩余生命）
 * @returns 就绪的游玩状态
 */
export declare function createDarkMazeState(seed: number, level: number, lives?: number): DarkMazeState;
/** 一次移动的结果事件（一次移动至多触发其中一个物品事件）。 */
export interface DarkMoveResult {
    /** 是否发生了位移。 */
    moved: boolean;
    /** 拾取了金币。 */
    coin: boolean;
    /** 踩中未触发过的陷阱。 */
    trap: boolean;
    /** 拾取了电池。 */
    battery: boolean;
    /** 到达出口过关。 */
    cleared: boolean;
    /** 生命耗尽游戏结束。 */
    gameover: boolean;
}
/** 朝 dir 走一步：撞墙不动；成功则朝向对齐移动方向并触发格上事件。
 * @param state 当前状态（就地修改）
 * @param dir 方向名
 * @returns 本次移动触发的事件
 */
export declare function moveDarkPlayer(state: DarkMazeState, dir: DarkDir): DarkMoveResult;
/** 旋转手电朝向（仅进行中状态生效）。
 * @param state 当前状态（就地修改）
 * @param facing 目标朝向弧度
 */
export declare function rotateDarkPlayer(state: DarkMazeState, facing: number): void;
/** 推进计时：衰减全图闪现剩余时间。
 * @param state 当前状态（就地修改）
 * @param dtMs 本帧毫秒
 */
export declare function tickDarkMaze(state: DarkMazeState, dtMs: number): void;
/** 计分：金币 ×10 + 已过关数 ×100。
 * @param state 当前状态
 * @param levelsCleared 累计已通关数
 * @returns 当前得分
 */
export declare function computeScore(state: DarkMazeState, levelsCleared: number): number;
/** 状态的 JSON 可比对快照（确定性重放测试用）。
 * @param state 当前状态
 * @returns 不含迷宫位掩码冗余、可直接 toEqual 比较的快照对象
 */
export declare function darkStateSnapshot(state: DarkMazeState): Record<string, unknown>;
