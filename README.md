# dsh-plugin-harness2

DSH/Cordis 上的 Harness² 递归 Harness 改进插件。当前版本提供可执行的核心编排、确定性 demo、DSH bridge 契约、文件/内存存储和自动化测试；真实 DSH SDK 绑定需要在主仓库提供 SDK 后完成。

## 开发

```bash
npm install
npm run build
npm test
npm run demo
```

核心行为：

- parallel 与 sequential 两种递归；
- 每种模式按 `4k` 次 rollout、`3k` 次编辑/合成阶段执行；
- INV/DOM 分工、Probe、Compose、匿名最终选择；
- 非法候选重试一次，然后继承当前 Harness；
- token/费用预算、取消、无交付回退；
- 按 tenant/project/domain 隔离的经验库。

设计和后续工作见 [开发计划](docs/dsh-plugin-harness2-development-plan.md)。
