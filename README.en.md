# dsh-plugin-harness2

[简体中文](README.md) | English

A recursive Harness² plugin for DeepSeek Harness (DSH/Cordis). For one explicit task, it runs Base → invariant/domain candidates → matched probes → composition, then returns an adopted result without changing model weights.

> [!IMPORTANT]
> This is a third-party community project, not an official Google or DeepSeek product. It is inspired by Google Research's [Harness² repository](https://github.com/google-research/harness2) and [paper](https://arxiv.org/abs/2610.14224). The current release is pinned to DeepSeek Harness `0.2.1-alpha.4`.

## What is implemented

- Parallel and sequential recursion: about `4k` executor rollouts and `3k` edit/composition stages per mode.
- Invariant/domain proposals, matched probes, selective composition, anonymized selection, and optional reflection.
- Native DSH materialization for C1–C7: prompts, guardrails, memory, tool guidance, subagents, skills, and gated Python scripts.
- Token and explicit-price budgets, timeouts, cancellation, fallbacks, audit records, and redacted lifecycle events.
- Tenant/project/domain-scoped experience storage and paired evaluation with bootstrap confidence intervals.

Ordinary DSH tasks are unchanged. Recursion starts only through an explicit `harness2_run` call. C7 scripts are disabled by default, and model-authored C8 middleware is never loaded.

## Requirements

- Node.js `^22.19.0` or `>=24`
- DeepSeek Harness `0.2.1-alpha.4`, tested at commit `86a402200d95fecef4529d969836f1fe13c6cb0d`
- Cordis `4.0.5-alpha.2`

## Build and install from source

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

The bundle is disabled by default. Enable the `harness2` row through DSH Plugins or a profile patch after reviewing budgets.

## Tools

| Tool | Purpose | Model calls |
|---|---|---|
| `harness2_plan` | Preview topology and budgets | No |
| `harness2_run` | Run recursive adaptation | Yes |
| `harness2_status` | List active runs | No |
| `harness2_cancel` | Cancel an exact run ID | No |

Start with `parallel`, `k=1`, `libraryMode=off`, `enableScripts=false`, and a hard token budget. See [configuration](docs/configuration.md), [deployment](docs/deployment.md), [architecture](docs/architecture.md), and [security](SECURITY.md).

## Evaluation

```bash
npm run eval:report -- observations.json harness2-k1
```

The report includes paired win/tie/loss, delivery and regression rates, tool errors, tokens/cost/latency, gain per cost, a bootstrap 95% CI, and a release gate. See [the evaluation guide](docs/evaluation.md).

The optional DSH-native operator UI is documented in [DSH visualization panel and Web Harness Diff](docs/dsh-visualization-panel.md).

## License

[MIT](LICENSE). See [NOTICE](NOTICE) for attribution and trademarks.
