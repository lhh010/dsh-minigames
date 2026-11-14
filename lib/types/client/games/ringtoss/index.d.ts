/**
 * 套圈达人游戏定义：把纯逻辑接成 {@link MiniGameInstance}——按住（鼠标/
 * 空格）蓄力、松开抛环；dirty 调度下瞄准静态零重绘，飞行/蓄力阶段逐帧
 * markDirty 走 continuous 语义；R 重开、P 暂停，分数变化经 onScore 上报
 * （最高分由面板管理）。粒子系统由本层持有，消费 logic 事件后叠加绘制。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const ringtossGame: MiniGameDefinition;
