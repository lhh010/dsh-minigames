/**
 * 倒水谜题 Jugs 游戏定义：把纯逻辑接成 {@link MiniGameInstance}。交互为
 * 点源壶再点目标壶倾倒、点水龙头装满选中壶、点排水槽倒空选中壶；
 * U 撤回、R 重开本关、P 暂停。任一壶达到目标即过关（上报 onScore，
 * 1.6s 后自动下一关）；步数超 par×2 判负。关卡进度持久化（重进恢复到最高关）。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const jugsGame: MiniGameDefinition;
