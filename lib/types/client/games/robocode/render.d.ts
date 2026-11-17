/**
 * 编程机器人 RoboCode 渲染层：科技风网格盘面、朝向箭头机器人（逐格移动 /
 * 转向旋转 / 跳跃弧线动画）、发光芯片与闸门、尖刺与坑、底部指令面板
 * （点击插入 / 删除、循环配对高亮）、运行进度与步数预算 HUD、过关与
 * 中断 overlay。全部为纯 canvas 绘制；状态由 index.ts 持有并注入
 * RobocodeView，本模块不持有可变状态。
 */
import { type ParticleSystem } from '../theme.ts';
import { type Dir, type RoboLevel, type RunStep, type Token } from './logic.ts';
/** 逻辑画布尺寸（720×608，fitCanvas 负责适配宿主）。 */
export declare const VIEW_W = 720;
export declare const VIEW_H = 608;
/** 渲染所需的全部游戏状态（index.ts 持有并逐帧注入）。 */
export interface RobocodeView {
    /** 当前关卡。 */
    level: RoboLevel;
    /** 编辑中的槽位程序。 */
    tokens: Token[];
    /** edit=编辑 / run=运行中 / won=过关 / fail=中断。 */
    mode: 'edit' | 'run' | 'won' | 'fail';
    /** 暂停中（叠加 overlay）。 */
    paused: boolean;
    /** 短暂提示文本与剩余毫秒。 */
    message: string;
    messageTtl: number;
    /** 关卡总数（HUD 显示 N/总数）。 */
    levelCount: number;
    /** 剩余芯片数（0 时闸门开启）。 */
    chipsLeft: number;
    /** 已拾取芯片的格索引（渲染时消隐）。 */
    collected: number[];
    /** 运行轨迹与正在动画的步索引。 */
    trace: RunStep[];
    traceIndex: number;
    /** 展开后第 i 条指令对应的槽位索引（运行进度高亮）。 */
    opToken: number[];
    /** 当前步动画进度 0..1 与时长 ms。 */
    animT: number;
    stepMs: number;
    /** 动画起点（插值用，dir 为连续角度）与终点状态。 */
    from: {
        x: number;
        y: number;
        dir: number;
    };
    robot: {
        x: number;
        y: number;
        dir: Dir;
    };
    /** 累计时长 ms（发光呼吸相位）。 */
    time: number;
    /** 进入 fail 模式的时刻（自动复位计时）。 */
    failAt: number;
    /** 中断原因文案。 */
    failReason: string;
    /** 拾取 / 过关 / 中断的粒子系统。 */
    particles: ParticleSystem;
}
/** 盘面几何：格边长与原点。 */
export interface BoardMetrics {
    cell: number;
    bx: number;
    by: number;
}
/**
 * 计算盘面几何（等比缩放居中）。
 * @param level 当前关卡。
 * @returns 格边长与盘面原点。
 */
export declare function boardMetrics(level: RoboLevel): BoardMetrics;
/**
 * 第 index 个槽位的矩形（多行时按行居中）。
 * @param index 槽位索引。
 * @param count 槽位总数（决定每行居中宽度）。
 * @returns 矩形 {x, y, w, h}。
 */
export declare function slotRect(index: number, count: number): {
    x: number;
    y: number;
    w: number;
    h: number;
};
/**
 * 命中测试：点击坐标落在哪个槽位。
 * @param px 逻辑 x。
 * @param py 逻辑 y。
 * @param count 槽位总数。
 * @returns 槽位索引，未命中返回 -1。
 */
export declare function slotHit(px: number, py: number, count: number): number;
/**
 * 命中测试：点击坐标落在哪个面板按钮。
 * @param px 逻辑 x。
 * @param py 逻辑 y。
 * @returns 该按钮插入的记号（'clear' 表示清空），未命中返回 null。
 */
export declare function paletteHit(px: number, py: number): Token | 'clear' | null;
/**
 * 渲染一帧：背景 → HUD → 盘面（含机器人插值动画）→ 指令面板 → 粒子 → overlay。
 * @param ctx 画布上下文（fitCanvas 已施加逻辑坐标变换）。
 * @param view 游戏状态。
 * @param dtMs 本帧毫秒（粒子推进用）。
 */
export declare function renderRobocode(ctx: CanvasRenderingContext2D, view: RobocodeView, dtMs: number): void;
