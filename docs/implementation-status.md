# dsh-plugin-harness2 实施状态

> 更新日期：2026-10-20  
> 对接版本：DeepSeek Harness `0.2.1-alpha.4`

## 已完成

- Harness Tree 规范化、SHA-256 指纹、diff 和静态校验。
- Parallel 与 Sequential 两种递归模式。
- INV/DOM Propose、匹配 Probe、Compose、`KEEP_BASE` 等价路径、匿名选择和 Reflect。
- 非法候选重试一次，第二次失败继承当前 Harness。
- token、费用字段、超时、取消、并发和无交付物回退。
- tenant/project/domain 隔离的文件经验库和内存测试存储。
- 原生 Cordis bundle 声明和 `harness2` 服务。
- 显式 `harness2_run` 模型工具；不拦截普通任务。
- 通过 `ctx.agents.create()` 建立临时 production Agent。
- 继承父 Agent 模型与 preset revision。
- 在 agent-scoped `SystemPrompt` 中物化 C1–C4 候选内容。
- 从 DSH Session 事件提取交付物、轨迹、token usage 和工具错误。
- Probe Agent 完成、失败或取消后的资源回收。
- editor、selector、reflector 与 executor token 的统一预算统计。
- 本地 DSH 源码链接脚本及 Web profile `link:` 安装。

## 验证结果

| 检查 | 结果 |
|---|---|
| TypeScript strict build | 通过 |
| 自动化测试 | 17/17 通过 |
| 生产 AgentLoop 单 Probe 集成 | 通过 |
| 生产 AgentLoop 完整 `k=1` 链路 | 通过，3 次编辑 + 4 次 rollout |
| 临时 Agent 回收 | 通过，运行后只保留父 Agent |
| npm 安全审计 | 0 vulnerabilities |
| npm pack dry-run | 通过，35 个发布文件 |
| DSH bundle 识别 | 通过，dump-config 中可见且默认禁用 |
| 正在运行的 Web 服务 | 在线，未带认证访问返回预期的 HTTP 401 |

## 当前限制

- 原生物化只支持 C1 System prompt、C2 Guardrails、C3 Memory、C4 Tool guidance。
- C5 Subagents、C6 Skills、C7 Scripts、C8 middleware plugin 会被原生 adapter 拒绝，避免生成“看起来成功但实际未挂载”的候选。
- DSH Session 的统一 usage 不提供费用，`maxCost` 在原生路径中暂时无法形成真实 provider 费用硬门槛；token 硬门槛已生效。
- 当前使用父 Agent 的模型同时承担 executor 和 editor。独立 editor route 尚未开放为配置。
- Web profile 已安装 bundle，但 `harness2` 行保持 `disabled: true`；尚未产生真实模型费用。
- 尚未使用真实业务任务进行质量 A/B，因此不能宣称质量提升。

## 下一阶段

1. 在 Plugins 页面启用 `harness2`，以 `k=1`、`libraryMode=off` 运行一个低风险任务。
2. 接入 provider 价格或 telemetry，形成真实费用硬门槛。
3. 通过 DSH preset/skill/sandbox 接口实现 C5–C7；C8 需要额外的插件签名和权限策略。
4. 冻结 10–20 个任务，比较 Base、Best-of-4 和 Harness² `k=1`。
5. 质量和成本信号成立后再启用 `k>1` 及经验库写入。
