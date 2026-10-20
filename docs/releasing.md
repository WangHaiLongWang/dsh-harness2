# 发布流程

## 前置条件

- 工作树干净，CI 在 Linux/Windows 上通过。
- `package.json`、`CHANGELOG.md` 和兼容性矩阵版本一致。
- 没有未处理的高危依赖漏洞。
- npm 账号对 `dsh-plugin-harness2` 包名有发布权限。

## 检查

```bash
npm ci
npm run link:dsh -- ../deepseek-harness
npm run check
npm run eval:report -- examples/evaluation-observations.json harness2-k1
git diff --check
```

检查 `npm pack --dry-run` 输出不包含测试、Session、Run Store、密钥、本机路径或 `node_modules`。

## 发布

```bash
npm version patch   # 或 minor/major
git push origin HEAD --follow-tags
npm publish --access public
```

在 GitHub Release 中粘贴对应 Changelog，说明精确 DSH 兼容版本、安全默认值和迁移要求。预发布版本应使用 semver prerelease 和 npm dist-tag，避免覆盖稳定通道。

## 回滚

npm 版本不可覆盖。发现问题后发布修复版本；需要阻止新安装时可 deprecate 有问题的版本，并在 GitHub Release 与安全通告中给出替代版本。不要删除已发布包来模拟回滚。
