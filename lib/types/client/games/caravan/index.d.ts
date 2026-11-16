/**
 * 丝路商队游戏定义：把纯逻辑接成 {@link MiniGameInstance}——点击相邻
 * 城市移动、点击/键盘买卖、数字键选商品、空格结束今天，R 重开、
 * P 暂停；dirty 帧循环按需重绘，驼队行进与事件卡翻开的短暂动画期间
 * 逐帧推进，分数（资产额）经 onScore 上报。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const caravanGame: MiniGameDefinition;
