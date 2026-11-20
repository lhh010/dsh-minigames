/**
 * 电路点灯 CircuitBulb 游戏定义：把纯逻辑（./logic.ts）接入面板生命
 * 周期。点击（或 ←→ + 空格/回车）拨动开关，让全部灯泡亮起；H 消耗提
 * 示指出一个拨错的开关；R 重开本关（seed 确定，电路可复现）；P 暂停。
 * 过关按 PAR 计分并累计总分，1.6s 后自动进入下一关；关卡进度走共享的
 * level-progress 持久化。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const circuitbulbGame: MiniGameDefinition;
