/**
 * 中国象棋游戏定义：把纯规则引擎与分帧 alpha-beta AI 组装成
 * MiniGameInstance —— 点击己方棋子再点高亮点走子；黑方由内置
 * AI 应着（每帧只算一个根着法切片，画面不卡顿）。难度 1-3 档对应
 * 搜索深度 2/3/4，D 键切换；U 悔棋（回退一整个回合）；R 重开；P 暂停。
 * 终局按难度上报分数。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const xiangqiGame: MiniGameDefinition;
