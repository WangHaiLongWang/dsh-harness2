# 兼容性

| dsh-plugin-harness2 | DeepSeek Harness | Cordis | Node.js | 状态 |
|---|---|---|---|---|
| 0.1.x | 0.2.1-alpha.4 | 4.0.5-alpha.2 | ^22.19 或 >=24 | 已测试 |

测试基线 DSH commit：`86a402200d95fecef4529d969836f1fe13c6cb0d`。

DSH 属于 pre-stable API。升级时至少检查：

- `ctx.agents.create()`、Agent `setup`、取消和 idle 语义；
- scoped SystemPrompt、Tool、Skill 注册；
- Subagent `spawn` provider；
- Session 事件与 usage 字段；
- Shell、SandboxPolicy 和 profile bundle 格式；
- Schemastery 配置行为。

更新 peer dependency 后，必须运行 `npm run link:dsh -- <new-checkout>` 和完整测试。未经该流程，不应通过版本豁免强行加载。
