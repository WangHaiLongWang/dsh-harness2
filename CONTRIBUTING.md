# Contributing

感谢参与。提交变更前请先在 Issue 中说明目标、DSH 版本、用户影响和安全边界；小型修复可直接提交 Pull Request。

## 环境

```bash
git clone https://github.com/WangHaiLongWang/dsh-harness2.git
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd dsh-harness2
npm install
npm run link:dsh -- ../deepseek-harness
npm test
```

当前兼容基线见 [docs/compatibility.md](docs/compatibility.md)。不要通过降级类型、跳过测试或版本豁免掩盖 DSH API 变化。

## 变更要求

- TypeScript strict build 通过。
- 新行为有成功、失败、取消和清理测试。
- 不在测试中调用真实付费模型；使用生产 AgentLoop 加 mock adapter。
- 新配置必须有安全默认值并更新配置文档。
- 新的模型可见内容必须可审计。
- 不提交密钥、token、Session、Run Store、经验库或本机绝对路径。
- C7/C8 相关变更必须解释文件、网络、进程和 Host 权限边界。

## 检查

```bash
npm test
npm audit --audit-level=high
npm pack --dry-run
git diff --check
```

## Commit 与 PR

建议使用 Conventional Commits，例如：

```text
feat: add read-only library inspection
fix: preserve base delivery on selector failure
docs: clarify script sandbox limitations
```

PR 描述应包含：结果、设计选择、风险、验证命令和兼容性影响。破坏性变化更新 `CHANGELOG.md` 和兼容性文档。

## 许可证

提交贡献即表示你有权以本仓库的 [MIT License](LICENSE) 提供该贡献。
