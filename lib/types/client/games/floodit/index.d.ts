/**
 * Flood It 游戏定义：把纯逻辑接成 {@link MiniGameInstance} —— 点击底部
 * 六色大色板（或按 1-6）把左上连通片换色合并，限定步数内把整盘染成
 * 单色即过关。H 高亮贪心下一步色；R 重开本关；P 暂停；[ ] 在已解锁
 * 关卡间切换。内部关卡号为 0 基，展示与持久化为 1 基（共享
 * level-progress 助手），重挂载时从上次进度继续。计分按关卡累计上报。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const flooditGame: MiniGameDefinition;
