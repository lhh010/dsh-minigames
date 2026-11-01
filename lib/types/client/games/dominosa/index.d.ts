/**
 * 多米诺分解游戏定义：把纯逻辑（./logic.ts）接入 MiniGameInstance ——
 * 点击一格选中，再点击相邻格配对；点击已配对的格子拆除该对；方向键移动
 * cursor、空格等同点击。配对覆盖全盘且多米诺组合各出现一次时触发
 * onScore（含时间奖励）并在 1.5 秒后自动进入下一关。进度持久化续玩；
 * P 暂停（过关倒计时用 stored-remainder 模式冻结）；R 重开；[ ] 在已
 * 到达的关卡内切换。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const dominosaGame: MiniGameDefinition;
