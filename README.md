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

原生 DSH 当前物化 C1–C6：system prompt、guardrails、memory、tool guidance、subagents 和 skills。`skills/<name>/SKILL.md` 注册为临时 Agent 的 scoped runtime skill；`subagents/<name>/AGENT.md` 注册为调用 DSH `spawn` provider 的 scoped delegation tool。两者随 probe Agent 一起卸载。C7 Scripts 和 C8 middleware plugin 仍会被拒绝并回退；C7 需要隔离资产目录与 sandbox 执行生命周期，C8 需要插件签名和权限策略。

Token 预算覆盖 editor、selector、reflection 和 executor rollout。货币预算需要部署方提供与当前 provider 账单一致的每百万 token 费率；插件不会猜测价格。仅配置 `maxCost` 而不配置 `pricing` 会在插件加载时失败：

```yaml
maxCost: 1.0
pricing:
  inputPerMillion: 1.0
  outputPerMillion: 4.0
  cacheReadPerMillion: 0.2
  cacheWritePerMillion: 1.0
```

上面的数字只是字段示例，不是任何供应商的报价。未配置 `pricing` 时费用显示为 0，表示不可计算；`maxTotalTokens` 仍是硬门槛。

设计和后续工作见 [开发计划](docs/dsh-plugin-harness2-development-plan.md)。
