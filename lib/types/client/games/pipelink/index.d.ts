/**
 * 「管道连连 Pipelink」游戏装配：把纯逻辑与渲染接成
 * {@link MiniGameInstance}——点击（或悬停+回车）旋转管件 90°，H 提示，
 * P 暂停，R 重开本关，过关 N 下一关；连通即进入放水动画，灌满出口桶
 * 结算得分并触发水花粒子。棋盘类按需重绘（dirty 模式），放水与粒子
 * 活跃期间逐帧驱动。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const pipelinkGame: MiniGameDefinition;
