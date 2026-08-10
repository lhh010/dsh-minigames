# dsh-minigames

DSH Web UI 右侧小游戏面板：等待模型回复或修 bug 时的摸鱼神器。

- **折叠态**：浏览器右缘一条小竖条（🎮），不占空间。
- **展开态**：点击后占据窗口**右半部分**（默认 50vw，可拖左缘调整 360px–80vw），
  面板内自由选择游戏。
- **游戏**（全部离线、零资源文件、Canvas 绘制）：
  1. 🦖 **恐龙跳一跳** —— Chrome 经典小恐龙；
  2. 🧱 **俄罗斯方块** —— 经典下落消除；
  3. 🛡️ **坦克大战（带 AI）** —— 2D 坦克对战，敌军追踪 + 视线开火，共 3 波；
  4. 💎 **消消乐** —— 点击消除四连通同色块，目标分过关、逐关递增；
  5. 🔢 **华容道** —— 16 格数字华容道（15-puzzle），滑动方块按序排列，用时越短分越高。
- **预留扩展接口**：游戏注册表（`registerGame`），新增游戏只需实现一个接口。
- **体验细节**：折叠面板/切换标签页时自动暂停游戏、恢复时继续；每局最高分存
  localStorage；键盘输入只在点击游戏区域后生效，不会劫持聊天输入框。

## 游戏玩法与细节

### 🦖 恐龙跳一跳

- 空格 / ↑ / 点击跳跃，↓ 蹲下；速度会**随分数提升**（`320 + 分数×0.15`）直到
  760 px/s 上限，越跑越快。
- **分数 = 移动距离 ÷ 10**，持续增长（约 50–150 分/秒）。
- 障碍：单柱仙人掌 / 双柱仙人掌 / **三种鸟**——
  - 高空鸟：从站姿头顶飞过，惩罚乱跳；
  - 低空鸟：**蹲下可躲**，或**跳到最高点**越过；
  - 贴地鸟：紧贴地面，**只能跳跃**躲（蹲下无效）。
- **后期障碍更密**：生成间隔随分数缩短（1.1–2.4s → 0.5–1.2s）。
- **每 800 分切换昼夜**：白天（米色）↔ 黑夜（反白）。
- **雨天机制**：每 1000 分起有 300 分（1000–1300、2000–2300 …）——
  斜落雨点 + 迷雾遮挡视线，并**随机闪电全屏白闪**。
- 计分上报节流为每 10 分一次，避免面板频繁刷新。

### 🧱 俄罗斯方块

- ←→ 移动，↑/X 旋转（Z 逆时针），空格硬降，C 暂存，P 暂停。
- 标准 10×20 棋盘、7 种方块（T/S/Z/J/L 采用 3×3 方阵旋转，不截断）、
  幽灵落点、下一个/暂存预览、等级加速（每 10 行一级）。
- 画布随面板自适应缩放（devicePixelRatio 高清），高度不足时收缩保比例，顶部不会被截断。

### 🛡️ 坦克大战（带 AI）

- WASD/方向键移动（**自由转向**，车身可贴墙转弯），空格开火，P 暂停，R 重开。
- 碰撞体积略小于一格（32×32 → 26×26），能过略窄通道；撞墙自动回吸网格线，
  直行时吸附网格边界，不会卡半格。
- 场景叠加半透明网格线，车道走向一目了然。
- 敌军 AI：贪心追踪 + 视线直射，出生口 2 格宽不卡墙；共 3 波（每波 5 辆）。
- 爆炸特效、出生闪烁无敌、履带动画、波次/生命 HUD。

### 💎 消消乐

- **点击任意格子，消除与它上下左右四连通的同色块**（对角线不算）；
- 一次消得越多分越高（平方级：`得分 = 10 × 消除数²`）；
- 消除后上方宝石**自由落体**补位（带下落动画、消除闪光、得分飘字），本关内不补新宝石；
- 达到**目标分过关**，目标逐关 **+400**（800 → 1200 → 1600 → …）；
- 无 ≥2 的同色块且未达标 → 游戏结束（R 重开）；支持鼠标点击与方向键+空格。
- 支持鼠标点击/拖动与键盘（方向键 + 空格）。

### 🔢 华容道

- 16 格数字华容道（15-puzzle）：4×4 棋盘，15 个编号方块 + 1 个空位；
- 从已解状态做随机有效滑动来打乱，**保证每次都可解**；
- **点击**空位同行/同列的方块（支持一次推多个）；或**方向键**滑动（方块朝箭头方向滑入空位）；
- 方块滑动带**插值动画**，在正确位置的方块自动变绿；
- **按最短用时计分**（`max(0, 1000 − 用时×2)`）：用时越短分数越高；
- HUD 显示步数 + 计时；完成显示步数/用时，R 或点击重新打乱。

## 安装

前置：已构建的 DSH 20260808+ 快照、`pnpm`。

```sh
git clone https://github.com/dsh-external/dsh-minigames.git   # 或直接使用本目录
cd dsh-minigames
pnpm install
pnpm build

# 装入当前 web profile（自动写入依赖并加入 dsh.profile.bundles）
dsh plugin --profile web add /绝对路径/to/dsh-minigames

# 可选：确认组合配置只出现一个插件行
dsh --profile web --dump-config | grep dsh-minigames
```

插件集合变更在**重启 `dsh web`** 后生效。卸载：

```sh
dsh plugin --profile web remove @dsh-external/dsh-minigames
```

> 本仓库同时携带 `dsh.plugin.json`（registry 通道清单）与 `cordis.patch.yml`
> （官方 profile bundle 通道）；二选一安装，不要同时启用。

## 使用

1. 打开 DSH Web UI（`dsh web`），页面右缘出现 🎮 小竖条。
2. 点击竖条 → 面板展开为窗口右半部分。
3. 点击游戏卡片开始；`P` 暂停、`R`（结算后）重开、点「选游戏」返回选择列表。
4. 再次点击「收起」折叠为竖条（游戏自动暂停，进度保留）。

## 开发

```sh
pnpm install
pnpm run typecheck   # tsc --noEmit
pnpm run test        # vitest 纯逻辑单测（70 个：引擎/棋盘/世界模型/三消/华容道/注册表）
pnpm run build       # tsc 声明 + tsdown：lib/index.js（node half）+ lib/client.js（浏览器 bundle）
```

产物结构（随源码提交，与 dsh-web-panel 一致）：

- `lib/index.js` —— node half（loader 行实现，仅日志；客户端插件扫描依赖该行存在）。
- `lib/client.js` —— 浏览器 bundle，`window.__ModuleLoader__.load({ id:
  '@dsh-external/dsh-minigames', factory })`，id 必须与 `package.json` 的
  `name` 一致（client-modules 以包名作为 compose 键）。
- `lib/types/` —— 声明文件。

### 架构

```
src/
  index.ts            node half（loader 行实现）
  invariant.ts        不变式伴生文件
  client/
    index.tsx         客户端插件：DOM portal 挂载面板（ctx.effect 管理生命周期）
    app.css           面板样式（全部 dmg- 前缀，随 bundle 注入 <style>）
    panel/Panel.tsx   折叠条 / 展开面板 / 游戏选择器 / GameArea 生命周期
    games/
      types.ts        游戏扩展接口（MiniGameDefinition / MiniGameInstance）
      registry.ts     注册表（registerGame / getGames / getGame）
      focus.ts        键盘焦点门控（避免劫持聊天输入）
      canvas-fit.ts   画布按宿主自适应缩放（devicePixelRatio，防截断）
      index.ts        内置游戏注册点
      dino/    纯逻辑（引擎：物理/计分/昼夜/雨天/生成密度）+ 渲染 + 游戏定义
      tetris/  纯逻辑（棋盘：旋转/消行/暂存/等级）+ 渲染 + 游戏定义
      tanks/   纯逻辑（世界：网格/转向吸附/AI/波次/特效）+ 渲染 + 游戏定义
      match3/  纯逻辑（三消：四连通/落体/目标分/关卡）+ 渲染 + 游戏定义
      huarong/ 纯逻辑（华容道：滑动/打乱/解状态）+ 渲染 + 游戏定义
tests/               纯逻辑单元测试
```

面板不依赖任何宿主服务与布局槽（纯 `document.body` portal），因此：
- 与主框架版本解耦，`dshClient.inject` 为空，客户端零 `@deepseek-ai` 依赖；
- 无论 DSH 布局如何变化（左栏/右栏/折叠）都不会冲突。

## 添加新游戏（预留接口）

实现 `MiniGameDefinition`（`src/client/games/types.ts`）：

```ts
import { registerGame, type MiniGameDefinition } from './index.ts'

const myGame: MiniGameDefinition = {
  id: 'my-game',            // 唯一 id（作为选中记忆与最高分 key）
  title: '我的游戏',
  icon: '🎯',
  description: '一句话介绍',
  controls: ['空格：跳跃', 'P：暂停'],   // 画布下方的按键图例
  create(host, options) {
    // 在 host 内创建 <canvas>；返回实例：
    return {
      start() {},    // 启动/恢复主循环
      pause() {},    // 暂停（面板折叠/切标签页/用户暂停时调用）
      resume() {},   // 恢复
      destroy() {},  // 释放 rAF/键盘监听等
    }
  },
}

registerGame(myGame)
```

`create` 返回的实例由面板驱动生命周期：切换游戏时先 `destroy()` 旧实例再
`create()` 新实例；面板折叠、标签页隐藏或用户点暂停时调用 `pause()`。
分数通过 `options.onScore?.(score)` 上报（仅在变化时调用），面板负责显示与
最高分持久化。建议把游戏逻辑拆成纯函数模块（不碰 DOM/定时器），与现有五个
游戏一样用单元测试覆盖。

## 已知限制与后续计划

- 键盘控制依赖游戏区域焦点；点击聊天输入框后需点回游戏区域才能继续操作（有意为之）。
- 坦克大战 AI 为贪心追踪 + 视线开火，无寻路；后续可加障碍绕行与不同装甲类型。
- 消消乐与方块/坦克的关卡进度不跨会话保存（仅最高分持久化）。
- 恐龙雨天/昼夜为纯视觉氛围，不影响判定。
