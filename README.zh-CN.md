# 🧭 helm

> **看着你的 coding agent 干活——还能随时掌舵。**
> 一块 **实时、可操舵** 的单任务看板:agent 干活时你在浏览器里看着,随时在板上改目标,它下一步就跟上。

[English](README.md) | **中文**

![Agent Skill](https://img.shields.io/badge/Agent-Skill-7c5cd0)
![Claude Code](https://img.shields.io/badge/Claude%20Code-%E2%9C%93-d97757)
![Codex](https://img.shields.io/badge/Codex-%E2%9C%93-2b8fb0)
![runtime](https://img.shields.io/badge/runtime-Node%20stdlib%20·%20zero%20deps-2f8f5b)
![License](https://img.shields.io/badge/license-MIT-blue)
[![skills.sh](https://skills.sh/b/chasey-myagi/helm)](https://skills.sh/s/chasey-myagi/helm)

![helm demo](examples/demo.gif)

> *一眼看完这条回路:agent 干活 → 遇岔口需要你拍板(板子转红 + 通知你)→ 你在板上写一句操舵 → 它读到「照办」继续(只跑 staging)。这条「你中途改方向、agent 跟随」的回路,就是 helm。*

大多数"给 agent 看进度"的工具都是**单向镜**:你只能看,看到它跑偏也得等它跑完。helm 把看板从**显示器**变成**方向盘**——你在页面上改 **目标** 或写一句 **操舵指令**,agent 在下一个检查点 `helm goal` 读到后跟着调整。不刷新、不闪烁、不留常驻进程;每次更新只花 agent 几个 token,所以这块板能分分钟保持诚实。

## 你什么时候会用到它?

- **长任务想盯着、又怕插不上手。** 迁移 / 重构 / 跑测试修一轮——你在另一个窗口干别的,余光扫一眼板就知道它干到哪、卡没卡。
- **想中途纠偏而不打断它。** 发现方向不对?在板上把「目标」改一行(「先只跑 staging」「别动 schema」),不用打断、不用重开对话,它下一步就跟上。
- **该它问你,而不是你追它。** 真需要拍板时,板上「需要你拍板」亮起,配桌面通知 + 标签标题 🔴 计数,把你叫回来。

## 它交付什么?

一块开在 `127.0.0.1` 的**活看板**(暖色浅底,深色可切):

- **左栏常驻** —— 现在(当前动作 · 状态脉冲 · 进度)· 计划(步骤即进度)· **你的操舵**(可编辑目标 + 操舵指令,保存即回写给 agent)· 需要你拍板。
- **右栏流水** —— 活动时间线(彩色事件,踩的坑也在这)· 决策 & 假设(假设带标记,便于你早纠偏)· 产物(链接 / 图片 / 数据)。

真实的一块 board 状态见 [`examples/sample-board.json`](examples/sample-board.json)。

## 安装

helm 是 **drop-in**:运行时零依赖,纯 Node 标准库,装好直接跑——**不用 `npm install`、不用构建**。

```bash
npx skills add chasey-myagi/helm          # 经 skills.sh
# …或直接拷目录:
cp -r helm ~/.claude/skills/              # Claude Code · Codex · 任何吃 SKILL.md 的 runtime
```

> ⚠️ 别把 CLI alias 成裸 `helm`——会和 Kubernetes 的 `helm` 撞名。用绝对路径调用即可(SKILL.md 已说明)。

## 怎么触发

按意图说话即可(中英都行):

- 「帮我做 X,**边做边给我个实时看板**看进度」
- 「我离开一会儿,弄个**看板**让我回来一眼看到你干到哪、还能**改方向**」
- 「这个迁移分几步,我想**盯着**、卡住了**叫我**」
- 「keep me posted on a live board while you refactor this」

**小贴士:** 最稳的触发是**点名这块板**——「做个 helm 看板」「give me a helm board」。长的多步任务里,靠谱的 agent 往往会自己提议开一块;没提就直接说。

## agent 怎么驱动它

```bash
HELM=~/.claude/skills/helm/dist/helm.mjs

$HELM init --title "迁移 auth → JWT" --goal "把 auth 迁到无状态 JWT,不丢在线会话"
$HELM plan "备份 users" "接入 RS256" "迁移会话" "灰度切流" "回归"
$HELM step 2                                    # 1 done、2 active、进度自动算
$HELM event ok "users 表已备份"
$HELM decide "签名用 RS256" ; $HELM decide "默认先迁 staging" --assumption
$HELM goal                                      # 检查点:读你在板上改过的目标/操舵并跟随
$HELM ask "先迁 staging 还是 prod?"              # 真阻塞 → 通知你
$HELM done "全部迁移完成,测试通过"
```

完整命令见 [`SKILL.md`](SKILL.md)。

## 它和同类有什么不同?

| | **helm** | [work-canvas](https://github.com/JingbiaoMei/work-canvas-skill) | [vibe-kanban](https://github.com/BloopAI/vibe-kanban) · [agent-kanban](https://github.com/saltbo/agent-kanban) |
|---|---|---|---|
| 形态 | **实时活看板(SSE)** | 跑完导出的静态 HTML 快照 | 实时看板 |
| 方向 | **双向——你改目标,它跟随** | 单向只读 | 多为编排/认领 |
| 粒度 | **单任务,聚焦一件事** | 单产物 | 多任务舰队 |
| 安装 | **零依赖 drop-in** | paste 安装仪式 | `npx` 起服务 |

实时的有人做、静态自包含的有人做、多任务舰队更是红海;但**「单任务 + 你中途改目标 + agent 跟随」这条车道,是 helm 的**。

## 它是用 helm 造的 🥏

这个仓,是 helm 看着自己长出来的。上面 demo 里那块板,就是跟踪 helm **自身开发**的同一块——计划、决策、它需要人拍板的时刻——从第一张草图一路到这份 README。全程 dogfood。

## 安全边界

- **只写自己的状态。** helm 只写 `<project>/.helm/<task>/state.json` 并起一个本地只读看板服务,**不碰你的源码**、不发任何外部请求。
- **不常驻、不复活。** 看板进程在没人看 / 任务空闲时**自己退出**,从不开机自启、从不自我重启。
- **如实呈现。** agent 只在检查点跟随你的操舵(它会主动 `helm goal`),不假装能在某一步中途被打断;假设项明确标 `assumption`,让走错的方向更容易被早早抓到。

## 仓里有什么

```
helm/
├── SKILL.md      agent 怎么用它(触发 · 工作流 · 命令)
├── dist/         运行时产物(提交,纯 Node 零依赖):helm.mjs · server.mjs · board.html
├── src/          TypeScript 源:types.ts(共享 BoardState)· cli · server · board
├── examples/     sample-board.json · demo.gif · record-demo.sh(可复现 demo)
├── *.md          PRODUCT · DESIGN · DEVRULES · ARCHITECTURE
└── build.mjs · package.json · tsconfig*   (仅开发用——esbuild + tsc)
```

改 `src/` 后 `npm run build` 重新生成 `dist/`。视觉取舍见 [`DESIGN.md`](DESIGN.md),技术设计见 [`ARCHITECTURE.md`](ARCHITECTURE.md)。

## 验证

- **浏览器端到端:** init → SSE 实时更新 → 页面改操舵 → `helm goal` 读到 → blocked 通知 → 进程自退,全过。
- **eval(skill-creator):** 3 个真实多步任务,带/不带 skill 对比。带 helm 时看板质量断言通过率 **100%(22/22)vs 不带 13.7%**,且 agent 过程方差骤降(token ±0.5k vs ±9.4k)。

## License

[MIT](LICENSE) © 2026 chasey
