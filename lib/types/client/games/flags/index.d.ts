/**
 * 旗帜竞猜游戏定义：把纯逻辑接成 {@link MiniGameInstance}——dirty 帧循环
 * （答题期逐帧推进倒计时与进度环，反馈/回顾静止时零重绘），点击或数字
 * 键 1-4 作答、空格下一题 / 下一节、R 重开、P 暂停；答对触发火花粒子，
 * onScore 按规范在分数变化时上报。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const flagsGame: MiniGameDefinition;
