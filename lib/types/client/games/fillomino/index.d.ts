/**
 * 装填方块游戏定义：把填数逻辑接入 MiniGameInstance —— 点击（或方向键）
 * 选中格子，数字键输入（区域大小可到两位数，支持两位输入：首位后 800ms
 * 内输入第二位即合并提交，超时按个位提交；超过盘面最大区域值的输入按
 * 个位处理或忽略）。空格循环 +1，0/退格清空；每个相同数字的连通块
 * 大小恰好等于该数字时过关。H 闪烁一个填错/未填格的答案 2.5 秒（任何
 * 提示都放弃时间奖励）。已持久化的关卡从上次进度继续；P 暂停（过关
 * 倒计时用剩余时间冻结模式）；R 重开；[ ] 在已到达关卡间切换。生成
 * ≤2ms，无需缓存。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const fillominoGame: MiniGameDefinition;
