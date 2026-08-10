# dsh-minigames

DSH Web UI 右侧小游戏面板：等待模型回复或修 bug 时的摸鱼神器。

- **折叠态**：浏览器右缘一条小竖条（🎮），不占空间。
- **展开态**：点击后占据窗口**右半部分**（默认 50vw，可拖左缘调整 360px–80vw），
  面板内自由选择游戏。
- **游戏**（全部离线、零资源文件、Canvas 绘制）：
  1. 🦖 **恐龙跳一跳** —— Chrome 经典小恐龙（空格/点击跳跃，↓ 蹲下躲鸟，速度递增）；
  2. 🧱 **俄罗斯方块** —— 经典下落消除（←→ 移动，↑/X 旋转，空格硬降，C 暂存，P 暂停）；
  3. 🛡️ **坦克大战（带 AI）** —— 2D 坦克对战，敌军会追踪玩家、沿直线开火，共 3 波。
- **预留扩展接口**：游戏注册表（`registerGame`），新增游戏只需实现一个接口。
- **体验细节**：折叠面板/切换标签页时自动暂停游戏、恢复时继续；每局最高分存
  localStorage；键盘输入只在点击游戏区域后生效，不会劫持聊天输入框。

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
pnpm run test        # vitest（纯逻辑单测：引擎/棋盘/世界模型/注册表）
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
      index.ts        内置游戏注册点
      dino/  tetris/  tanks/   各自：纯逻辑（引擎/棋盘/世界模型）+ Canvas 渲染 + 游戏定义
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
最高分持久化。建议把游戏逻辑拆成纯函数模块（不碰 DOM/定时器），与现有三个
游戏一样用单元测试覆盖。

## 已知限制与后续计划

- 键盘控制依赖游戏区域焦点；点击聊天输入框后需点回游戏区域才能继续操作（有意为之）。
- 坦克大战 AI 为贪心追踪 + 视线开火，无寻路；后续可加障碍绕行与不同装甲类型。
- 游戏状态不跨会话保存（仅最高分持久化）。
