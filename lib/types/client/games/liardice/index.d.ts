/**
 * 吹牛骰游戏定义：把纯逻辑接成 {@link MiniGameInstance}——↑/↓ 调数量、
 * ←/→ 调点数、Enter 出价/续局、L 叫吹牛、R 重开（换新种子）、P 暂停；
 * 数量/点数选择器与出价、吹牛大按钮均可点击。回合制 dirty 帧循环：
 * 输入、AI 思考倒计时与开骰翻面动画期间重绘；局分经 onScore 上报
 * （每局 100 分，夺冠再奖 300 + 剩余骰 × 10）。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const liardiceGame: MiniGameDefinition;
