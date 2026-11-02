/**
 * 21点游戏定义：把纯逻辑接成 {@link MiniGameInstance}——H 要牌、S 停牌、
 * D 加倍（仅首两张）、B 循环下注档、Enter 发牌/续局、R 重开（换新牌靴
 * 与余额）、P 暂停、C 对子分牌（可选加分项，两手依次操作）；按钮与
 * 下注筹码支持点击。回合制 dirty 帧循环：仅
 * 输入、暗牌翻牌动画、结算浮字与破产遮罩计时期间重绘；结算经 onScore
 * 上报余额。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const blackjackGame: MiniGameDefinition;
