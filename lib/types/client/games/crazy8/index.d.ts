/**
 * 疯狂八号游戏定义：把纯逻辑接成 {@link MiniGameInstance}——点击手牌
 * 出牌（亮边为可出）、无牌可出点击牌堆摸牌（摸到可出的牌可打出或点
 * 牌堆放弃）、出 8 后按 1-4 或点击花色宣告、Enter 下一局、R 重开
 * （换新种子）、P 暂停。AI 回合在人类操作后同步结算；回合制 dirty
 * 帧循环：仅输入与局末粒子期间重绘；整场积分经 onScore 上报。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const crazy8Game: MiniGameDefinition;
