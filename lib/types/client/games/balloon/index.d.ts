/**
 * 吹气球 game definition：按住（空格 / 指针）充气，松手存分换新
 * 气球；10 只一轮，爆掉本局清零。R 重开（新 seed）、P 暂停；存入与
 * 爆裂事件粒子反馈。充气需要连续动画，使用 continuous 帧循环。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const balloonGame: MiniGameDefinition;
