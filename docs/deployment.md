# 部署与运维

## 1. 兼容性确认

```bash
node --version
cd /path/to/deepseek-harness
git describe --tags --always
```

当前支持 Node.js `^22.19.0 || >=24` 和 DSH `dsh-v0.2.1-alpha.4`。源码集成测试固定到 commit `86a402200d95fecef4529d969836f1fe13c6cb0d`。

## 2. 构建插件

```bash
cd /path/to/dsh-plugin-harness2
npm install
npm run link:dsh -- /path/to/deepseek-harness
npm test
npm pack --dry-run
```

## 3. 安装 Bundle

```bash
cd /path/to/deepseek-harness
pnpm dsh plugin --profile web add "link:/absolute/path/to/dsh-plugin-harness2"
```

确认 DSH 能解析 Bundle：

```bash
pnpm dsh web --dump-config
```

输出应包含 `id: harness2`，且首次安装为 `disabled: true`。

## 4. 启用与重启

在 Plugins 页面启用，或在 profile patch 中覆盖：

```yaml
- id: harness2
  name: dsh-plugin-harness2
  disabled: false
```

如果 HMR 已停止或 link 包的 JavaScript 构建发生变化，安全停止原有 DSH Web 进程，并使用原来的 profile 参数重新启动。不要同时启动第二个 3080 实例。

## 5. 受控冒烟

1. 调用 `harness2_plan`，确认 `k=1`、脚本关闭和预算。
2. 选择一个纯文本、无外部副作用的任务。
3. 调用一次 `harness2_run`。
4. 用 `harness2_status` 观察；必要时用 `harness2_cancel`。
5. 检查 `$DSH_HOME/harness2/runs/<run-id>/summary.json`。

验收条件：状态 completed、4 个 rollout、3 个 stage、无错误、没有残留临时 Agent 或资产目录。

## 6. 灰度

- Shadow：只在内部评测 Session 使用。
- 5%：限定一个 domain，`k=1`、library off。
- 20%：评估稳定后开启 library read-only。
- 50%：只有发布门槛持续通过时才考虑 read-write。

停止条件包括严重回退、交付率下降、费用或 p95 时延超限、数据隔离事件及 sandbox 异常。

## 7. 备份和清理

- `runs/` 是审计数据，可按组织策略设置 TTL。
- `library/` 会改变后续行为，变更前应备份。
- `assets/` 正常情况下为空；进程崩溃可能留下 run-scoped 目录，确认没有活跃 run 后再处理。
- 不要把 `$DSH_HOME/harness2`、DSH Session、凭证或启动 token 提交到 Git。

## 8. 回滚

首先禁用 profile 中的 `harness2` 行并重载/重启 DSH。禁用不会删除历史 Run Store 或经验库。需要完全移除时：

```bash
pnpm dsh plugin --profile web remove dsh-plugin-harness2
```

数据删除是单独的破坏性操作，应先备份并明确选择目标目录。
