/**
 * 圈地争夺游戏定义：把纯逻辑引擎与渲染层接入面板生命周期——
 * 方向键按住沿边缘滑行 / 垂直切入空地拖笔迹、回边闭合圈地，
 * R 重开整场、P 暂停，continuous 帧循环驱动步进与闪烁动画。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const qixGame: MiniGameDefinition;
