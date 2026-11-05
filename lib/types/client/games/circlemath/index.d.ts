/**
 * 圆周挑战游戏定义：把纯逻辑接入 MiniGameInstance —— 点击扇区或 方向键
 * ↑/↓ 切换活动环，←/→ 将活动环旋转一步（计步）；所有径向列的数字之
 * 和都等于目标和时过关，步数超过上限判负。H 提示金色高亮一个未达标
 * 列并显示目标和 2.5 秒（用过提示过关时步数奖励归零）。已持久化的关
 * 卡从上次进度继续；P 暂停；R 重开；[ ] 在已到达关卡间切换。盘面为
 * dirty 帧循环，空闲零重绘。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const circlemathGame: MiniGameDefinition;
