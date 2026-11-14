/**
 * 调色大师游戏定义：把纯调色逻辑接成 {@link MiniGameInstance} —— 点击/
 * 数字键 1·2·3 滴红黄蓝原色，U 撤回一滴，空格提前提交（达标即过关并按剩余滴数
 * 奖励），滴数用完自动判定；R 重开整局，P 暂停。五关递进，全部过关
 * 后可整局重来；得分通过 onScore 上报。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const colormixGame: MiniGameDefinition;
