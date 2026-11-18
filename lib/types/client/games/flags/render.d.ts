/**
 * 旗帜竞猜画布渲染：题区居中大号程序化旗帜（或国名）+ 2×2 选项卡片
 * （国名或旗）、倒计时进度环、连击火花提示、答错红显与正确答案绿显、
 * 知识卡（答完即出该国冷知识）、节末小结（错题列表 + 冷知识）与结束 /
 * 暂停 overlay。旗帜全部由 drawFlag 按题库 stripes 字段程序化绘制，
 * 不依赖 emoji 字体（Windows 无彩色旗绘字形）。渲染器无状态，所有状态
 * 由 index.ts 传入。
 */
import type { FlagEntry, FlagsState } from './logic.ts';
import { createParticles } from '../theme.ts';
/** 逻辑画布尺寸。 */
export declare const LOGICAL_W = 480;
export declare const LOGICAL_H = 640;
/**
 * 命中测试：逻辑坐标落在哪个选项卡片上。
 * @param x - 逻辑横坐标。
 * @param y - 逻辑纵坐标。
 * @returns 选项位次 0-3，或 null（未命中）。
 */
export declare function optionAt(x: number, y: number): number | null;
/**
 * 程序化绘制一面国旗：圆角裁剪内按 stripes 描述依次画条纹、canton、
 * 斜线/十字/三角/星月/圆点，最后描边。完全不依赖 emoji 字体，Windows
 * 上旗面与任何平台渲染一致。十字/斜线/星在有 canton 时画在 canton 内
 * （希腊十字、澳新小米字、智利星），圆点与月牙始终按全旗坐标绘制。
 * @param ctx - 逻辑坐标系已就绪的 2d 上下文。
 * @param entry - 题库条目（取其 stripes 描述）。
 * @param x - 旗面左上角横坐标。
 * @param y - 旗面左上角纵坐标。
 * @param w - 旗面宽度。
 * @param h - 旗面高度。
 */
export declare function drawFlag(ctx: CanvasRenderingContext2D, entry: FlagEntry, x: number, y: number, w: number, h: number): void;
/**
 * 画一帧。
 * @param ctx - 逻辑坐标系已就绪的 2d 上下文。
 * @param state - 游戏状态。
 * @param particles - 连击火花粒子系统（场景绘制后、overlay 前 tick）。
 * @param paused - 是否暂停（画暂停 overlay）。
 * @param dtMs - 本帧毫秒数（供粒子 tick）。
 */
export declare function renderFlags(ctx: CanvasRenderingContext2D, state: FlagsState, particles: {
    tick(ctx: CanvasRenderingContext2D, dtMs: number): void;
    burst(x: number, y: number, color: string, count?: number, speed?: number): void;
}, paused: boolean, dtMs: number): void;
/** 连击火花粒子系统（复用共享粒子池）。 */
export declare function createFlagsParticles(): ReturnType<typeof createParticles>;
