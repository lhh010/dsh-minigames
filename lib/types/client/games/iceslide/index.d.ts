/**
 * 冰面滑行游戏定义：把纯逻辑接成 {@link MiniGameInstance}——方向键/WASD
 * 滑行（点击画布上相邻方向同样触发），U 撤回一步，R 重开本关，P 暂停，
 * N 过关后进入下一关；dirty 按需渲染（滑行动画与粒子活跃时才重绘），
 * 分数经 onScore 上报。回合制，无 gameplay 计时器。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const iceslideGame: MiniGameDefinition;
