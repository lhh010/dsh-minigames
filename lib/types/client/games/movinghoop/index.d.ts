/**
 * 移动篮筐游戏定义：把纯逻辑接成 {@link MiniGameInstance}——在篮球附近
 * 按住向反方向拖拽（弹弓式）松手出手，continuous 帧循环推进模拟与渲染，
 * 篮筐随投数升级运动模式（静止 → 浮沉 → 巡逻 → 复合 8 字），R 重开、
 * P 暂停，累计分经 onScore 上报（最高分由面板管理）。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const movinghoopGame: MiniGameDefinition;
