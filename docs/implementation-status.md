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
- C5 `subagents/<name>/AGENT.md` 物化为 scoped delegation tool，复用 DSH `spawn` provider。
- C6 `skills/<name>/SKILL.md` 物化为 scoped runtime skill。
- C7 `scripts/<name>.py` 的受控物化：run-scoped 资产目录、固定 stdin 工具、DSH shell/sandbox、完成后清理；部署开关默认关闭。
- 从 DSH Session 事件提取交付物、轨迹、token usage 和工具错误。
- Probe Agent 完成、失败或取消后的资源回收。
- editor、selector、reflector 与 executor token 的统一预算统计。
- 显式 per-million pricing 和跨 editor/rollout 的货币硬预算；未配置价格时不推断费用。
- 配对评估报告：Win/Tie/Loss、回退率、交付率、工具错误率、token/费用/时延、Gain-per-Cost、bootstrap 95% CI 和发布门槛。
- 零模型调用的 `harness2_plan` 预检工具。
- 不含任务/轨迹/交付物正文的 `harness2/event` 生命周期遥测。
- 同一进程内按 scope 串行化经验库 append，避免并发 read-modify-write 丢记录。
- `harness2_status` 活跃任务查询和 `harness2_cancel` 精确 run-id 取消。
- 本地 DSH 源码链接脚本及 Web profile `link:` 安装。

## 验证结果

| 检查 | 结果 |
|---|---|
| TypeScript strict build | 通过 |
| 自动化测试 | 32/32 通过 |
| 生产 AgentLoop 单 Probe 集成 | 通过 |
| 生产 AgentLoop 完整 `k=1` 链路 | 通过，3 次编辑 + 4 次 rollout |
| 临时 Agent 回收 | 通过，运行后只保留父 Agent |
| npm 安全审计 | 0 vulnerabilities |
| npm pack dry-run | 通过；发布内容以当前 `npm pack --dry-run` 输出为准 |
| DSH bundle 识别 | 通过，dump-config 中可见且默认禁用 |
| 正在运行的 Web 服务 | 在线，未带认证访问返回预期的 HTTP 401 |
| Web profile 真实 `k=1` 冒烟 | 通过，`harness2_run` 仅调用一次，工具结果为 `HARNESS2_SMOKE_OK` |

真实冒烟采用 `parallel / k=1 / library=off`，审计摘要为 `completed`，包含 1 个 Base rollout 和 INV、DOM、COMPOSE 三个阶段；采用 `final1`，无 fallback、无错误、四个 rollout 均交付成功。插件链路统计 17,670 个 uncached input tokens、1,719 个 output tokens、28,928 个 cached tokens；父 Session 另统计 10,473/177 input/output tokens。该数字说明即使 `k=1` 也属于高成本路径，维持显式工具触发是必要的。

## 当前限制

- 原生物化支持 C1–C7；C5/C6 使用 DSH scoped registration，C7 使用 run-scoped 资产目录，均随 probe Agent 回收。
- C7 默认关闭。DSH sandbox 当前不承诺网络隔离，不能将其视为不可信 Python 的完整安全边界；缺少 shell 或 sandbox policy 时拒绝候选。
- C8 middleware plugin 会被原生 adapter 拒绝，避免模型生成代码直接进入 Host 工具循环。
- DSH Session 的统一 usage 不提供价格；部署方需要填入 provider 费率后才可启用 `maxCost`。只填 `maxCost` 会拒绝加载，避免产生虚假的费用保护。
- 当前使用父 Agent 的模型同时承担 executor 和 editor。独立 editor route 尚未开放为配置。
- Web profile 已安装并启用 `harness2`。普通任务不会自动运行 Harness²；只有显式调用 `harness2_run` 才产生额外调用。
- 尚未使用真实业务任务进行质量 A/B，因此不能宣称质量提升。

## 下一阶段

1. 从实际 provider 账单确认当前 route 的费率并写入 profile；代码侧货币硬门槛已经完成。
2. 为 C7 增加网络隔离后再评估生产启用；C8 需要额外的插件签名和权限策略。
3. 冻结 10–20 个任务，比较 Base、Best-of-4 和 Harness² `k=1`。
4. 质量和成本信号成立后再启用 `k>1` 及经验库写入。
