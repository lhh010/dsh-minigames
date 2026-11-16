/**
 * 引力弹弓 Orbit 游戏定义：把纯逻辑接成 {@link MiniGameInstance}——
 * continuous 帧循环推进模拟与渲染。拖拽瞄准（弹弓式：反向拖拽）松手
 * 发射；空格/P 暂停，1/2/3 时间倍速，H 参考解提示，R 重开本关。过关
 * 与失败后自动流转；得分经 onScore 上报（最高分由面板管理）。
 */
import type { MiniGameDefinition } from '../types.ts';
/** 引力弹弓 Orbit：一次点火，借行星引力转弯，规划轨迹抵达信标。 */
export declare const orbitGame: MiniGameDefinition;
