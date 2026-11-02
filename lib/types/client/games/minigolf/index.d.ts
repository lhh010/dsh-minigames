/**
 * 迷你高尔夫游戏定义：把纯逻辑状态机接入 {@link MiniGameInstance}——
 * 在果岭任意处按下拖拽蓄力（拉杆方向的反方向击球，力度 ∝ 拉距），
 * 松手击球；也可 ← / → 旋转瞄准、长按空格蓄力。R 重开本关，P 暂停
 * （面板暂停同样生效），[ ] 在已解锁关卡间切换。入洞触发粒子与星级
 * 浮字，累计星数作为分数上报；关卡进度走共享 level 存储。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const minigolfGame: MiniGameDefinition;
