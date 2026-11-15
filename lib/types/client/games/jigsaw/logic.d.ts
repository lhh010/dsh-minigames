/** mulberry32 伪随机数生成器（同 fifteen/logic.ts 构造）。 */
export declare function mulberry32(seed: number): () => number;
/**
 * 二维确定性哈希：把整数坐标与 seed 混合成 [0,1) 的稳定值。
 * @param x - 横向整数坐标（如碎片列号）。
 * @param y - 纵向整数坐标（如碎片行号）。
 * @param seed - 种子。
 * @returns [0,1) 的确定性伪随机值。
 */
export declare function hash2(x: number, y: number, seed: number): number;
/** 单块碎片边长（逻辑像素）。 */
export declare const CELL = 64;
/** HUD 高度。 */
export declare const HUD_H = 34;
/** 最大列数（第 5 关 6×6）。 */
export declare const BOARD_COLS_MAX = 6;
/** 盘面最大边长（6×CELL）。 */
export declare const BOARD_MAX: number;
/** 逻辑画布宽。 */
export declare const LOGICAL_W: number;
/** 盘面顶部 y。 */
export declare const BOARD_Y: number;
/** 托盘顶部 y（盘面区按最大边长预留）。 */
export declare const TRAY_Y: number;
/** 托盘高度。 */
export declare const TRAY_H = 260;
/** 逻辑画布高。 */
export declare const LOGICAL_H: number;
/** 托盘矩形（碎片散布区）。 */
export declare const TRAY: {
    x: number;
    y: number;
    w: number;
    h: number;
};
/**
 * 某尺寸盘面的左上角坐标（水平居中）。
 * @param size - 盘面每边块数。
 */
export declare function boardOrigin(size: number): {
    x: number;
    y: number;
};
/**
 * 碎片 (row,col) 正确格的中心坐标。
 * @param size - 盘面每边块数。
 * @param row - 目标行。
 * @param col - 目标列。
 */
export declare function targetCenter(size: number, row: number, col: number): {
    x: number;
    y: number;
};
/** 吸附距离容差（像素）。 */
export declare const SNAP_TOL = 24;
/** 单关配置：块数、是否需要旋转、散布抖动幅度。 */
export interface JigsawLevelConfig {
    /** 每边块数（4→6）。 */
    size: number;
    /** true 时碎片初始带随机旋转档且吸附要求角度归零。 */
    rotate: boolean;
    /** 托盘散布抖动幅度（像素，越大越散乱）。 */
    jitter: number;
}
/** 5 关递进配置：块数 16→36、散乱度上升、第 3 关起需要旋转。 */
export declare const LEVELS: readonly JigsawLevelConfig[];
/** 图案中的几何形状（坐标为整图归一化 [0,1)）。 */
export interface SceneShape {
    /** 形状类别。 */
    kind: 'circle' | 'square' | 'triangle';
    /** 中心横坐标（归一化）。 */
    fx: number;
    /** 中心纵坐标（归一化）。 */
    fy: number;
    /** 特征半径（归一化）。 */
    r: number;
    /** 填充色。 */
    color: string;
    /** 不透明度 [0,1]。 */
    alpha: number;
}
/** 噪点斑纹（归一化坐标的小圆点）。 */
export interface SceneSpeckle {
    /** 横坐标（归一化）。 */
    fx: number;
    /** 纵坐标（归一化）。 */
    fy: number;
    /** 半径（归一化）。 */
    r: number;
    /** 颜色。 */
    color: string;
}
/** 一幅完整拼图图案：渐变底 + 几何形状 + 噪声斑纹。 */
export interface PatternScene {
    /** 渐变顶色。 */
    baseTop: string;
    /** 渐变底色。 */
    baseBottom: string;
    /** 几何形状（先画在下层）。 */
    shapes: SceneShape[];
    /** 噪声斑纹。 */
    speckles: SceneSpeckle[];
}
/**
 * 按 seed 构建整幅图案场景：同一 seed 输出完全一致（碎片图案确定的来源）。
 * @param seed - 图案种子。
 * @returns 可直接绘制的场景描述。
 */
export declare function buildPatternScene(seed: number): PatternScene;
/**
 * 纯函数采样图案颜色：按自上而下的绘制顺序取最上层元素，纯逻辑可测。
 * @param scene - 图案场景。
 * @param fx - 归一化横坐标 [0,1)。@param fy - 归一化纵坐标 [0,1)。
 * @returns 该点的十六进制颜色。
 */
export declare function sampleScene(scene: PatternScene, fx: number, fy: number): string;
/**
 * 碎片描边色：同一 (seed,row,col) 确定，用于区分相邻碎片。
 * @param seed - 关卡种子。@param row - 碎片行。@param col - 碎片列。
 */
export declare function pieceTint(seed: number, row: number, col: number): string;
/** 一块碎片：id = row*size+col，图案固定为正确位置的裁切。 */
export interface JigsawPiece {
    /** 碎片编号（等于正确位置的平铺下标）。 */
    id: number;
    /** 正确行。 */
    row: number;
    /** 正确列。 */
    col: number;
    /** 当前中心 x（逻辑坐标）。 */
    x: number;
    /** 当前中心 y（逻辑坐标）。 */
    y: number;
    /** 旋转档位 0..3（0 为正确角度）。 */
    rot: number;
    /** 已吸附到正确格。 */
    placed: boolean;
}
/** 一关的完整状态。 */
export interface JigsawState {
    /** 关卡号（1 起）。 */
    level: number;
    /** 每边块数。 */
    size: number;
    /** 本关是否需要旋转对齐。 */
    rotate: boolean;
    /** 关卡种子（图案与散布都由它决定）。 */
    seed: number;
    /** 全部碎片（id 顺序）。 */
    pieces: JigsawPiece[];
    /** 已用步数（放置尝试/旋转/提示）。 */
    moves: number;
    /** 已用毫秒（由 index 的帧循环累加）。 */
    elapsedMs: number;
}
/**
 * 生成一关：图案 seed + 碎片按 seed 打散到托盘（网格 + 抖动）。
 * @param level - 关卡号（1 起，超出 5 循环）。
 * @param seed - 关卡种子。
 * @returns 完整初始状态（含全部碎片与散布位置）。
 */
export declare function createLevel(level: number, seed: number): JigsawState;
/** 已正确放置的碎片数。 */
export declare function placedCount(state: JigsawState): number;
/** 全部碎片归位即过关。 */
export declare function isComplete(state: JigsawState): boolean;
/**
 * 旋转一档：0→1→2→3→0 循环（每档 90°）。
 * @param state - 关卡状态（原地修改）。@param id - 碎片编号。
 */
export declare function cyclePiece(state: JigsawState, id: number): void;
/**
 * 吸附判定：碎片中心距正确格中心 ≤ 容差，且（旋转关）角度档为 0 时吸附
 * 归位；否则原地不动。
 * @param state - 关卡状态（成功时原地更新碎片）。
 * @param id - 碎片编号。
 * @param snapTol - 距离容差（默认 {@link SNAP_TOL}）。
 * @returns true 表示已吸附。
 */
export declare function tryPlace(state: JigsawState, id: number, snapTol?: number): boolean;
/**
 * 提示：把编号最小的未归位碎片摆到正确格（角度归零并标记已放）。
 * @returns 被放置的碎片编号，或 null（已全部完成）。
 */
export declare function hintPlace(state: JigsawState): number | null;
/**
 * 计分：关卡基础分 + 奖励，减去用时与步数惩罚，下限 100。
 * @param level - 关卡号。@param elapsedMs - 用时毫秒。@param moves - 步数。
 * @returns 不低于 100 的整数分。
 */
export declare function computeScore(level: number, elapsedMs: number, moves: number): number;
