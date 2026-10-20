# DSH 可视化面板与 Web Harness Diff

Harness² 的可视化界面作为 DSH Web 客户端插件运行，源码位于配套 DSH 工作区的 `packages/experimental/harness2-panel`。它与 `dsh-plugin-harness2` 共用 Run Store，但保持只读。

## 能看到什么

- 最近 100 个父运行及完成、失败、取消状态。
- 模式、`k`、阶段数、Token、显式价格成本、工具错误和回退次数。
- `Base → INV/DOM → Compose → Adopted` 流程及每阶段耗时、交付和回退状态。
- Base 与最终采用 Harness，或 Base 与任一候选阶段之间的逐文件、逐行 Diff。
- 加行、删行、上下文行及输入、输出、缓存 Token 明细。

旧的 `summary.json` 没有 `baseHarness` 字段，仍可显示指标和候选树，但无法还原完整 Base Diff。当前版本会在新运行中持久化已验证的 Base Harness。

## 本地启用

面板包需要随 DSH Web 构建和启动。配套 DSH 源码已包含以下 profile 行：

```yaml
- id: harness2-panel
  name: '@deepseek-ai/dsh-experimental-harness2-panel'
  config:
    dataDir: !!js dshHomePath('harness2/runs')
```

先构建面板，再重启原 Web profile：

```powershell
cd D:\ProjectS\deepseek-harness
pnpm --filter @deepseek-ai/dsh-experimental-harness2-panel bundle
```

打开 DSH 后，左侧栏的分支图标对应 `Harness²` 面板。执行一次新的 `harness2_run` 后点击“刷新”，即可查看完整 Diff。

## 安全边界

Host API 只返回结构化摘要和 Harness 树；不会返回完整 trajectory、任务正文、deliverables、凭据或任意本地文件。运行 ID 只能包含安全字符，单个 summary、树文件数量和文件内容大小均有上限，路径会在读取前进行边界校验。
