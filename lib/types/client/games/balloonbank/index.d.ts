/**
 * 气球银行 game definition：空格打气（潜在奖金翻倍，可能触发隐藏爆
 * 点）、Enter 兑现入银行、R 重开（新 seed）、P 暂停。打气中的气球有
 * 常驻形变动画，打气/粒子期间逐帧重绘，静止棋盘态走 dirty 按需渲染。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const balloonbankGame: MiniGameDefinition;
