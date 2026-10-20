# dsh-plugin-harness2

[English](README.en.md) | 简体中文

[![CI](https://github.com/WangHaiLongWang/dsh-harness2/actions/workflows/ci.yml/badge.svg)](https://github.com/WangHaiLongWang/dsh-harness2/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![DSH](https://img.shields.io/badge/DeepSeek%20Harness-0.2.1--alpha.4-blue)](https://github.com/deepseek-ai/deepseek-harness)

面向 DeepSeek Harness（DSH/Cordis）的 Harness² 递归执行框架。在不修改模型权重的前提下，它针对一个明确任务运行 Base → INV/DOM 候选 → Probe → Compose，比较行为差异并返回采用结果；可选的领域经验库把有执行证据支持的经验用于后续任务。

> [!IMPORTANT]
> 这是第三方社区项目，不是 Google 或 DeepSeek 官方产品。设计参考 Google Research 的 [Harness²](https://github.com/google-research/harness2) 与[论文](https://arxiv.org/abs/2610.14224)，当前精确适配 DeepSeek Harness `0.2.1-alpha.4`。

## 当前能力

- 内置 DSH Web 可视化面板，展示 Base → INV/DOM → Compose 流程与文件/行级 Harness Diff。
- Parallel 和 Sequential 两种递归模式；一种模式约执行 `4k` 个 rollout 和 `3k` 个编辑/合成阶段。
- INV（通用执行能力）与 DOM（领域能力）分工、匹配 Probe、选择性 Compose、匿名最终选择。
- C1–C7 Harness 组件：system prompt、guardrails、memory、tool guidance、subagents、skills、scripts。
- Token/显式价格预算、超时、取消、失败回退、运行状态和脱敏生命周期事件。
- 按 `tenant/project/domain` 隔离的经验库，以及 Base 配对评估和 CI 发布门槛。
- 32 项自动化测试、真实 DSH AgentLoop 集成测试和 `k=1` 实机冒烟。

## 安全默认值

- 普通 DSH 任务不会自动触发；只有显式调用 `harness2_run` 才执行递归。
- Bundle 默认禁用，安装本身不产生模型调用。
- `k=1`、`libraryMode=off`、`enableScripts=false`。
- C8 middleware plugin 禁止自动生成或加载。
- C7 只支持固定的 `scripts/<name>.py` 工具，且默认关闭。DSH 当前 sandbox 不承诺网络隔离，不应把 C7 当作运行不可信 Python 的完整安全边界。

## 要求

| 依赖 | 支持范围 |
|---|---|
| Node.js | `^22.19.0` 或 `>=24.0.0` |
| DeepSeek Harness | `0.2.1-alpha.4`，源码 commit `86a402200d95fecef4529d969836f1fe13c6cb0d` |
| Cordis | `4.0.5-alpha.2` |
| Python | 仅开启 C7 时需要，命令名为 `python` |

DSH API 尚未稳定。其他 DSH 版本需要先更新 peer dependency、重新构建并运行原生 AgentLoop 契约测试。

## 安装

### 从本地源码安装

```bash
git clone https://github.com/WangHaiLongWang/dsh-harness2.git
git clone https://github.com/deepseek-ai/deepseek-harness.git

cd dsh-harness2
npm install
npm run link:dsh -- ../deepseek-harness
npm test

cd ../deepseek-harness
pnpm dsh plugin --profile web add "link:$(cd ../dsh-harness2 && pwd)"
```

Windows PowerShell 可以直接传绝对目录：

```powershell
npm run link:dsh -- C:\src\deepseek-harness
cd C:\src\deepseek-harness
pnpm dsh plugin --profile web add "link:C:\src\dsh-harness2"
```

安装后在 DSH Plugins 页面启用 `harness2`，或在 profile 的 `cordis.patch.yml` 中添加：

```yaml
- id: harness2
  name: dsh-plugin-harness2
  disabled: false
```

### npm 安装

本仓库已经包含 npm 发布元数据，但只有发布到 registry 后下列命令才可使用：

```bash
pnpm dsh plugin --profile web add dsh-plugin-harness2
```

## 使用

首先运行零成本预检：

```text
harness2_plan
  mode: parallel
  k: 1
```

确认预算后执行：

```text
harness2_run
  domain: office
  mode: parallel
  k: 1
  task: <完整任务描述>
```

运维工具：

| 工具 | 作用 | 模型调用 |
|---|---|---|
| `harness2_plan` | 预览调用拓扑和预算 | 无 |
| `harness2_run` | 执行递归 Harness 改进 | 有 |
| `harness2_status` | 查询活跃运行 | 无 |
| `harness2_cancel` | 按精确 run ID 取消 | 无 |

## 配置

完整字段和风险说明见 [配置参考](docs/configuration.md)。推荐起点：

```yaml
- id: harness2
  name: dsh-plugin-harness2
  disabled: false
  config:
    mode: parallel
    k: 1
    timeoutMs: 3600000
    maxParallelProposals: 2
    maxParallelRollouts: 2
    maxTotalTokens: 100000
    libraryMode: off
    enableScripts: false
    tenant: default
    project: default
    dataDir: !!js dshHomePath('harness2')
```

设置货币预算时必须同时填写真实 provider 费率。插件不会猜测价格：

```yaml
maxCost: 1.0
pricing:
  inputPerMillion: 1.0
  outputPerMillion: 4.0
  cacheReadPerMillion: 0.2
  cacheWritePerMillion: 1.0
```

以上数字只是字段示例，不是任何供应商报价。

## 数据与审计

默认数据目录位于 `$DSH_HOME/harness2/`：

```text
harness2/
├── runs/<run-id>/summary.json
├── runs/<run-id>-<stage>/run.json
├── library/<tenant>/<project>/<domain>/entries.json
└── assets/                         # C7 临时目录，正常结束后删除
```

`harness2/event` 只广播 run/stage 标识、状态和 usage，不广播任务正文、轨迹或交付物。详细内容只写入 Run Store；部署者应自行设置目录权限、备份和保留周期。

## 评估

输入 Base 和候选方法的配对 observation JSON，可生成 Win/Tie/Loss、交付率、回退率、工具错误率、Token/费用/时延、Gain-per-Cost、bootstrap 95% CI 和上线门槛：

```bash
npm run eval:report -- observations.json harness2-k1
```

门槛不通过时命令返回非零退出码。格式示例见 [examples/evaluation-observations.json](examples/evaluation-observations.json)，方法详见 [评估指南](docs/evaluation.md)。

## 开发

```bash
npm install
npm run link:dsh -- ../deepseek-harness
npm run build
npm test
npm run demo
npm run check
```

`link:dsh` 只在本项目的 `node_modules` 中建立开发链接，不修改 DSH 源码。CI 会检出固定 DSH commit 后运行相同测试。

## 文档

- [DSH 可视化面板与 Web Harness Diff](docs/dsh-visualization-panel.md)

- [架构说明](docs/architecture.md)
- [配置参考](docs/configuration.md)
- [部署与运维](docs/deployment.md)
- [安全模型](SECURITY.md)
- [评估指南](docs/evaluation.md)
- [实施状态](docs/implementation-status.md)
- [完整开发计划](docs/dsh-plugin-harness2-development-plan.md)
- [贡献指南](CONTRIBUTING.md)
- [变更日志](CHANGELOG.md)

## 许可证与致谢

本项目使用 [MIT License](LICENSE)。Harness²、DeepSeek Harness 及其第三方依赖分别保留自己的许可证；本仓库没有复制 Google Harness² 的实现代码。来源与免责声明见 [NOTICE](NOTICE)。
