/**
 * 交通堵塞渲染层：盘面网格、右侧出口箭头缺口、红车醒目红、其它车按朝向
 * 配色（水平蓝 / 垂直绿圆角矩形 + 车窗细节）、选中金色高亮、HUD 区绘制
 * 关卡 / 步数 / 最优 / 分数、过关金色粒子 + 遮罩、暂停遮罩。渲染为无状态
 * 纯绘制（粒子系统为画布级单例）。
 */
import { type RushHourState } from './logic.ts';
/**
 * 主渲染入口：背景、盘面、出口箭头、车辆、HUD、粒子与遮罩。
 * @param ctx - 画布上下文（已施加逻辑坐标变换）。
 * @param state - 当前状态。
 * @param selected - 选中车辆索引（null 为未选中）。
 * @param paused - 是否暂停。
 * @param dragPreview - 拖拽实时预览：被拖车辆将落在的目标位置（null 无拖拽）。
 */
export declare function renderRushHour(ctx: CanvasRenderingContext2D, state: RushHourState, selected: number | null, paused: boolean, dragPreview?: {
    idx: number;
    pos: number;
} | null): void;
