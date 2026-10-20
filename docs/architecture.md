# 架构说明

## 目标

`dsh-plugin-harness2` 在冻结模型权重的情况下改进任务执行 Harness。算法层与 DSH 运行时解耦：核心只依赖 `DshHarnessSubstrate`、`HarnessEditor`、`ExperienceStore` 和 `RunStore` 接口，原生适配层负责 Cordis、Agent、Session、Skill、Subagent 和 Shell 的物化。

## 数据流

```text
显式 harness2_run
  │
  ├─ Base rollout × k
  │
  ├─ INV proposer × k ── candidate rollout × k
  ├─ DOM proposer × k ── candidate rollout × k
  │
  ├─ Composer × k ────── final rollout × k
  │
  ├─ k > 1: 匿名 Selector
  └─ library=read-write: Reflector → Experience Store
```

Parallel 模式让 `k` 表示宽度；Sequential 模式让 `k` 表示连续修订轮数。两者都约产生 `4k` 个 executor rollout 和 `3k` 个 editor/composer session。

## 模块

| 模块 | 责任 |
|---|---|
| `src/core/orchestrator.ts` | 递归状态机、预算、回退、选择与反思 |
| `src/core/harness-tree.ts` | 可编辑路径、规范化、校验、diff 和指纹 |
| `src/dsh/agent-runner.ts` | 创建临时 DSH Agent、执行、Session 证据提取和清理 |
| `src/dsh/model-editor.ts` | 使用父 Agent route 执行 proposer/composer/selector/reflector |
| `src/dsh/components.ts` | C5 Subagent 与 C6 Skill 的 scoped 注册 |
| `src/dsh/script-assets.ts` | C7 临时资产、固定工具、shell/sandbox 执行和清理 |
| `src/storage/*` | Run Store 和领域经验库 |
| `src/eval/metrics.ts` | 配对评估、bootstrap CI 和发布门槛 |

## DSH 生命周期

插件不包装 `agent/pre-step`。显式工具调用进入 `DshHarness2Runtime`，每次 rollout 通过 `ctx.agents.create()` 建立带有父 Agent ownership 的临时 Agent：

1. 继承父 Agent 的 provider、model、reasoning effort 和 preset revision。
2. 在未发布 Agent 的 `setup` 阶段注册 scoped prompt、skill、subagent tool 和可选 script tool。
3. 拒绝内部 Agent 再调用 `harness2_run/plan/status/cancel`，防止递归自触发。
4. 发送任务并等待 Agent 与其 managed children 都进入 idle。
5. 从 append-only Session 事件提取交付物、轨迹、usage 和工具错误。
6. 释放 Agent、scoped registrations 和临时资产。

## Harness 组件

| 组件 | DSH 物化方式 | 状态 |
|---|---|---|
| C1 System prompt | scoped SystemPrompt section | 稳定 |
| C2 Guardrails | scoped SystemPrompt section | 稳定 |
| C3 Memory | scoped SystemPrompt section | 稳定 |
| C4 Tool guidance | scoped SystemPrompt section | 稳定 |
| C5 Subagents | scoped tool → DSH `spawn` provider | Beta |
| C6 Skills | scoped runtime skill | Beta |
| C7 Scripts | run-scoped `.py` asset → fixed shell tool | 实验性、默认关闭 |
| C8 Middleware plugin | 不物化 | 禁止 |

## 失败与回退

- 候选 Harness 校验失败后，编辑器收到一次结构化反馈；再次失败则继承本轮起始 Harness。
- rollout 异常被记录为失败 `RunArtifact`，不会丢失审计证据。
- selector 失败优先回退到已交付 Base。
- 达到 Token、费用、时长或取消信号后停止开启后续工作。
- 经验不足时 Reflector 返回 `NO_ENTRY`，不污染经验库。

## 存储与事件

运行和阶段记录使用原子 JSON 替换；同一进程内的经验库 append 按文件串行化。`harness2/event` 是非权威、脱敏的运行遥测，监听器异常不会改变执行结果。完整轨迹和交付物仅保存在 Run Store。
