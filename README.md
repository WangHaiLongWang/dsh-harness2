# dsh-plugin-harness2

DSH/Cordis 上的 Harness² 递归 Harness 改进插件。当前版本已对接 DeepSeek Harness `0.2.1-alpha.4`：通过生产 `AgentRegistry` 创建隔离 rollout Agent，在 agent-scoped SystemPrompt 中物化候选 Harness，并从 Session 事件提取轨迹、交付物和 token usage。

## 开发

```bash
npm install
npm run link:dsh -- D:\ProjectS\deepseek-harness
npm run build
npm test
npm run demo
```

`link:dsh` 只建立本地开发类型/运行时链接，不会修改 DSH 源码。当前 Web profile 的安装命令为：

```powershell
cd D:\ProjectS\deepseek-harness
pnpm dsh plugin --profile web add "link:D:\ProjectS\dsh-harness2"
```

Bundle 默认把 `harness2` 行设为 `disabled: true`，安装不会产生模型调用。完成预算和模型配置检查后，可在 Web 的 Plugins 页面启用该行。启用后，模型获得显式的 `harness2_run` 工具；插件不会拦截普通 `agent/pre-step`，也不会自动放大每个任务的调用量。

核心行为：

- parallel 与 sequential 两种递归；
- 每种模式按 `4k` 次 rollout、`3k` 次编辑/合成阶段执行；
- INV/DOM 分工、Probe、Compose、匿名最终选择；
- 非法候选重试一次，然后继承当前 Harness；
- token/费用预算、取消、无交付回退；
- 按 tenant/project/domain 隔离的经验库。

原生 DSH MVP 当前物化 C1–C4：system prompt、guardrails、memory 和 tool guidance。C5–C8（subagents、skills、scripts、middleware plugin）的候选编辑会被拒绝并回退，等待后续接入 DSH preset/skill/sandbox 安装面。

Token 预算覆盖 editor、selector、reflection 和 executor rollout。DSH 当前 Session usage 不提供统一费用字段，因此原生运行中的 `maxCost` 仍为预留门槛；生产启用前应在 provider 计费/telemetry 层补齐实际费用回传。

设计和后续工作见 [开发计划](docs/dsh-plugin-harness2-development-plan.md)。
