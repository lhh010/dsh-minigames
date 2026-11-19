/**
 * 诺诺旋转游戏接线：把纯逻辑与渲染装进 MiniGameInstance。左键填黑（再点取消）、
 * 右键打叉、空格或按钮执行校验（有错则盘面顺时针旋转 90° 并消耗一次校验）、
 * 过关后空格进入下一关；R 重开本关，P 暂停。dirty 按需重绘。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const nonospinGame: MiniGameDefinition;
