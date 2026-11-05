/**
 * 极速反应 game definition：多轮信号反应测试——灯变绿立刻按空格或
 * 点击，反应越快分越高；抢按或超时扣命，3 命 10 轮。R 重开、P 暂停；
 * 命中与通关事件粒子庆祝，onScore 随得分变化上报。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const reactionGame: MiniGameDefinition;
