# 评估指南

## 目的

证明收益来自 Harness 修改，而不只是更多采样。至少比较：

- Base：原始 Harness 单次运行。
- Best-of-k Base：不修改 Harness，多次采样后盲选。
- Harness² `k=1`。
- 预算允许时比较 Parallel/Sequential `k=2`。

## 任务集

- 先冻结 10–20 个代表性任务，正式结论建议扩大样本。
- 每项至少运行 3 个 seed。
- 固定模型版本、工具集、环境、Base Harness 和评分器。
- 经验库实验必须记录任务顺序，并为不同方法使用独立库。

## Observation 格式

```json
{
  "taskId": "task-001",
  "seed": 1,
  "method": "harness2-k1",
  "score": 87.5,
  "delivered": true,
  "latencyMs": 70000,
  "cost": 0.42,
  "inputTokens": 17670,
  "outputTokens": 1719,
  "cachedTokens": 28928,
  "toolCalls": 4,
  "toolErrors": 0
}
```

允许的方法值：`base`、`best-of-k`、`harness2-k1`、`harness2-parallel`、`harness2-sequential`。同一 `taskId + seed + method` 必须唯一。

## 运行报告

```bash
npm run eval:report -- observations.json harness2-k1
```

默认门槛：

- 配对得分增量的 bootstrap 95% CI 下界大于 0。
- Win 数大于 Loss 数。
- DeliveryRate 不低于 Base。
- Tool error rate 不高于 Base。
- 超过容差的回退率不高于 1%。

命令在门槛失败时返回退出码 1，可直接用于 CI。质量评分器和业务容差属于部署方，不能由插件统一决定。

## 解读

- `gainPerCost` 只在候选平均费用高于 Base 时给出。
- 置信区间基于配对 delta，而不是两个独立均值。
- 少量样本即使全部获胜，也不能替代覆盖不同难度、领域和失败模式的任务集。
- 论文结果是方法可行性证据，不是本部署的提升承诺。
