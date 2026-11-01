/**
 * 纸牌接龙游戏定义：把纯逻辑接成 {@link MiniGameInstance}——点击选牌、
 * 再点目标移动；对单牌再点一次自动寻找合法目标（优先基础堆）；点击发牌
 * 堆翻牌（空堆回收废牌堆）；U 撤销、D 翻发牌堆、R 开新局（局号 +1，
 * seed+局号决定新牌局）、P 暂停。回合制 dirty 帧循环：无操作零重绘，
 * 分数经 onScore 上报。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const solitaireGame: MiniGameDefinition;
