# 配置参考

## 默认配置

```yaml
mode: parallel
k: 1
timeoutMs: 3600000
maxParallelProposals: 2
maxParallelRollouts: 2
maxTotalTokens: 1000000
enableScripts: false
scriptTimeoutMs: 30000
scriptOutputMaxBytes: 1000000
libraryMode: off
tenant: default
project: default
dataDir: !!js dshHomePath('harness2')
```

## 字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `mode` | `parallel \| sequential` | 递归宽度或深度模式 |
| `k` | `1..5` | 探索预算；生产初始值应为 1 |
| `timeoutMs` | 正数 | 每个 rollout 和 editor 调用上限 |
| `maxParallelProposals` | 正整数 | proposer/composer 并发上限 |
| `maxParallelRollouts` | 正整数 | executor 并发上限 |
| `maxTotalTokens` | 正整数 | editor 与 executor 的累计硬门槛 |
| `maxCost` | 正数，可选 | 配置 `pricing` 后的累计费用硬门槛 |
| `pricing` | 对象，可选 | 每百万 token 的真实部署价格 |
| `enableScripts` | boolean | 开启实验性 C7；默认 false |
| `scriptTimeoutMs` | 正数 | 单个 C7 工具执行时限 |
| `scriptOutputMaxBytes` | 正整数 | C7 stdout 捕获上限 |
| `libraryMode` | `off \| read-only \| read-write` | 经验库策略 |
| `tenant` | string | 经验库租户分区 |
| `project` | string | 经验库项目分区 |
| `dataDir` | 绝对路径 | Run Store、Library 和临时资产根目录 |

## 费用配置

```yaml
maxCost: 1.0
pricing:
  inputPerMillion: 1.0
  outputPerMillion: 4.0
  cacheReadPerMillion: 0.2
  cacheWritePerMillion: 1.0
```

价格单位由部署者决定，但四个字段和 `maxCost` 必须使用同一货币。只配置 `maxCost` 会拒绝插件加载；未配置价格时 `estimatedCost=0` 表示不可计算，不代表免费。

## 推荐配置

### 开发/首次冒烟

```yaml
k: 1
maxTotalTokens: 100000
libraryMode: off
enableScripts: false
```

### 内部灰度

```yaml
k: 1
maxTotalTokens: 250000
libraryMode: read-only
enableScripts: false
```

只有自身配对评估通过后才考虑 `k>1` 或 `read-write`。不要用论文中的提升数字替代本地评估。

## 调用规模

| k | Rollout | 编辑/合成 | Selector | Reflector |
|---:|---:|---:|---:|---:|
| 1 | 4 | 3 | 0 | 仅 read-write 时 1 |
| 2 | 8 | 6 | 1 | 仅 read-write 时 1 |
| 5 | 20 | 15 | 1 | 仅 read-write 时 1 |

执行前使用 `harness2_plan` 查看实际配置。
