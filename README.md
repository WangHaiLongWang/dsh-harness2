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

原生 DSH 当前物化 C1–C7。`skills/<name>/SKILL.md` 注册为临时 Agent 的 scoped runtime skill；`subagents/<name>/AGENT.md` 注册为调用 DSH `spawn` provider 的 scoped delegation tool。`scripts/<name>.py` 在显式开启后写入 run-scoped 插件资产目录，映射为只接受 stdin 的固定 scoped tool，经 `ctx.shell` 和 `ctx.sandboxPolicy` 执行，随后清理。C5–C7 都随 probe Agent 一起卸载。

C7 默认 `enableScripts: false`。DSH 当前 sandbox 约束文件效果，但不承诺网络隔离，因此不得将 C7 视为不可信 Python 的完整安全边界；生产环境应继续关闭，直到部署提供网络隔离。缺少 `ctx.shell` 或 `ctx.sandboxPolicy` 时，C7 候选校验会失败而不是无沙箱执行。C8 middleware plugin 仍需要插件签名和权限策略。

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

## 评估报告

输入 Base 与候选方法的配对 observation JSON 后，可生成 Win/Tie/Loss、交付率、回退率、token/费用/时延、Gain-per-Cost、bootstrap 95% 置信区间和上线门槛判断：

```bash
npm run eval:report -- observations.json harness2-k1
```

同一 `taskId + seed + method` 只能出现一次。命令在上线门槛未通过时返回非零退出码，便于接入 CI。

## 运行预检与事件

启用插件后可调用 `harness2_plan`，在不进行任何模型调用的情况下查看 `4k` rollout、`3k` 编辑阶段、selector/reflection 调用数以及 token、费用和 C7 开关。真实运行通过 `harness2/event` 发出不含任务正文、轨迹或交付物的生命周期事件；完整内容只保存在 Run Store。

运行中的任务可通过 `harness2_status` 查询，并用 `harness2_cancel` 加精确 `runId` 取消。内部 rollout Agent 会收到同一个取消信号并完成资源回收。

设计和后续工作见 [开发计划](docs/dsh-plugin-harness2-development-plan.md)。
