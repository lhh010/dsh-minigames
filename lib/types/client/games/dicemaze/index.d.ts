/**
 * 骰子行军游戏定义：把纯逻辑接成 {@link MiniGameInstance}——方向键 /
 * WASD 翻滚骰子（数字门需翻滚后顶面匹配、碎地板踩过即碎），U 撤回、
 * R 重开（同种子同图）、P 暂停。5 关递进（棋盘、门数、碎地板增多），
 * 通关后 L5 回绕 L1；最高到达关卡持久化（../level-progress.ts），重进
 * 从上次进度开始。回合制 + 翻滚动画：dirty 调度，静止零重绘，动画与
 * 过关粒子期间逐帧 markDirty。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const dicemazeGame: MiniGameDefinition;
