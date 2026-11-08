/**
 * 24点游戏定义：把纯逻辑接成 {@link MiniGameInstance}——点牌选两张
 * （再点取消），点 + − × ÷ 按钮或运算小键盘合并；U 撤回（快照栈）、
 * H 提示闪一步正确操作并自动选牌（本局奖励降为 25 分）、N 换一局
 * （无解跳局扣 20 分并清零连胜，获胜后进入下一局不扣）、R 重开、
 * P 暂停。回合制 dirty 帧循环：仅输入、提示闪烁与粒子期间重绘；
 * 分数变化经 onScore 上报。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const game24Game: MiniGameDefinition;
