/**
 * 弹幕决战游戏定义：把纯逻辑接成 {@link MiniGameInstance}——方向键 / WASD
 * 四向移动，Z / J 射击（按住连发，冷却由逻辑层节流），Shift 按住进入精确
 * 模式（减速 + 缩小判定点 + 显示擦弹圈），R 重开、P 暂停，continuous 帧循
 * 环推进模拟与渲染，分数经 onScore 上报累计分（最高分由面板管理）。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const danmakuGame: MiniGameDefinition;
