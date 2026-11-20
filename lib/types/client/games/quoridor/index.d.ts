/**
 * 鬼墙游戏定义：把纯规则与启发式 AI 接成 {@link MiniGameInstance}。
 * 点击棋盘走子（合法落点有提示），W 循环切换 走子→横墙→竖墙 模式，
 * 放墙模式下点击墙槽放置（悬停显示半透明幽灵预览，非法显示红）；
 * AI 延迟片刻回手（侧栏显示思考提示）。三局两胜：局分记在 HUD，随
 * 已结束局数提升 AI 难度（0→2 级）。R 重开当前局（整届结束后重置整
 * 届），P 暂停。dirty 渲染：只有交互、AI 落子与粒子活动时重绘。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const quoridorGame: MiniGameDefinition;
