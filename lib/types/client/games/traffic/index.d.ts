/**
 * 交叉路口 game definition：把确定性调度逻辑接成 MiniGameInstance ——
 * 空格（或点击画布）请求切换信号灯相位（NS 绿 / EW 绿，黄灯过渡固定
 * 1.5s，最短绿灯 3s）；绿灯方向的车通过路口计分（每辆 +10，外加存活
 * 秒数），红灯方向排队；两车相撞或任一方向排队超过 7 辆即结束。
 * R 重开，P 暂停。分数经 onScore 上报。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const trafficGame: MiniGameDefinition;
