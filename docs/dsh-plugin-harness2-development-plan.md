# dsh-plugin：对齐 Google Harness² 的设计、落地与提升评估

> 文档状态：方案基线 v0.1  
> 调研日期：2026-10-19  
> 适用对象：dsh 核心开发、插件开发、Agent/模型平台、测试与安全团队

## 1. 结论先行

建议把 Harness² 能力实现为一个发布包 **`dsh-plugin-harness2`**，包内由四个协作 Cordis 插件（Proposer、Prober、Composer、Reflector）和一个 Experience Store 插件组成。它不是单一工具，也不是只改一段 system prompt，而是在不修改模型权重的前提下：

1. 对同一任务执行基线 harness；
2. 分别生成“通用执行能力（INV）”和“领域能力（DOM）”两类候选 harness；
3. 用相同任务、模型和环境试跑候选，获得行为对照；
4. 根据执行轨迹和交付物选择性合成新 harness，再执行一次；
5. 在多个最终交付物之间盲选，不让选择器看到候选来源；
6. 从完整过程提炼有证据支撑的经验，按领域写入持续改进库，供后续任务复用。

落地顺序应是：**先打通 `k=1` 的 Propose–Probe–Compose 最小闭环，再增加并行/串行递归，最后开放跨任务经验库**。这样可以先验证质量收益是否覆盖额外模型成本，也能把高风险的自动代码修改与长期记忆延后。

现有设计材料确认 DSH 基于 Cordis 的“一切皆插件”架构，并给出了 `agent/pre-step`、`agent/request`、`agent/turn-stopping`、`subagent/start`、`subagent_fork` 等扩展点；但当前仓库没有 dsh 主工程、插件 SDK、事件 payload 类型或示例插件。因此本文给出目标设计、SPI 草案和工作拆分；事件名可作为设计输入，函数签名仍须在真正编码前通过第 8.1 节冻结。

## 2. Harness² 调研结论

### 2.1 项目定位

Harness² 全称为 **Harness²: Recursive Agent Harnessing for an Open World**，由 Northwestern University 与 Google Cloud AI Research 作者提出。它面向开放世界任务，在没有标准答案或在线评分器的情况下，递归改进模型周边的执行 harness；模型参数保持冻结。

它有两层递归：

- **任务级递归**：针对当前任务，通过 Propose–Probe–Compose 修改并验证执行 harness。
- **Harnessing 级递归**：任务结束后，将采用的 harness 和有执行证据支撑的经验写入改进库，使未来的 harness 修改过程本身变得更好。

官方实现将三个维度明确解耦：

- `method`：递归、提示词、选择、经验库；
- `substrate`：实际运行 Agent 的框架，例如 OpenCode、Codex；
- `benchmark`：任务、输入材料、交付物抽取和离线评分适配器。

这正是 dsh 插件化实现应保留的边界：算法核心不依赖 dsh 内部细节，dsh 仅由一个 substrate adapter 接入。

### 2.2 八类可编辑 Harness 组件

| 编号 | 组件 | 激活时机 | 用途 | dsh 中的建议映射 |
|---|---|---|---|---|
| C1 | System prompt | 每次模型调用 | 身份和顶层流程 | `agent/pre-step` waterfall 注入 |
| C2 | Guardrails | 每次模型调用 | 始终生效的硬约束 | `agent/pre-step` policy 插件 |
| C3 | Memory | 每次模型调用 | 领域内长期事实 | 独立 scoped-memory 插件 |
| C4 | Tool guidance | 每次模型调用 | 工具选择和使用规则 | `agent/request` 动态调整 |
| C5 | Subagents | 被任务工具调用时 | 独立上下文中的委派执行 | DSH 内置 subagent 工具/注册表 |
| C6 | Skills | 按需调用时 | 特定场景的专业流程 | skill 插件/loader |
| C7 | Scripts | runner 调用时 | 确定性能力 | sandboxed script 插件/资产 |
| C8 | Plugin | 工具调用及轮次边界 | 模型不可绕过的中间件行为 | Cordis runtime hook 插件 |

需要特别区分：表中的 **C8 Plugin 只是 Harness² 可修改的八类组件之一**；本项目的 `dsh-plugin-harness2` 则是承载整套递归编排的 dsh 插件。前者由后者管理。

### 2.3 Propose–Probe–Compose

一次对照改进包含：

1. **Reference/Base**：用当前 harness 执行任务，得到轨迹 `τ` 和交付物 `y`。它只显示行为，不代表答案正确。
2. **Propose/INV**：针对规划、工具调用、上下文、验证、委派等跨领域缺陷提出修改。
3. **Propose/DOM**：针对当前领域的知识、步骤、约束、交付物结构提出修改。
4. **Probe**：在相同任务、模型和环境配置下执行两个候选，观察相对基线的行为变化。
5. **Compose**：读取基线、候选 diff、轨迹和交付物，选择合并、修订、采用某一候选或 `KEEP_BASE`；每个决定必须指向具体执行证据。
6. **Execute successor**：执行合成后的 harness，形成最终候选与完整 step record。

重要原则是“行为对照而非伪装成正确性验证”。单次运行会受随机性和共同模型偏差影响，不能把候选输出更像答案等同于修改有效。

### 2.4 两种扩展方式

| 模式 | 行为 | 适用情形 | 主要代价 |
|---|---|---|---|
| Parallel | 同时探索 `k` 个 INV、`k` 个 DOM，再独立生成 `k` 个合成结果 | 高并发、希望增加探索宽度 | 并发峰值和总 token 高 |
| Sequential | 连续做 `k` 轮，每轮继承上一轮 harness 和全部历史证据 | 希望逐轮纠错、并发资源少 | 墙钟时间更长、后轮可能累积漂移 |

官方实现中，每种模式约有 `4k` 次 executor rollout 和 `3k` 次修改/合成 session；`k>1` 还需要一次最终选择，任务结束后另有反思。`k=1` 只有一个合成结果，跳过选择器。

### 2.5 Harnessing 级经验库

经验库按领域隔离。每条有效记录至少包含：

- 被采用的完整可执行 harness 快照；
- `EXPERIENCE.md`：适用场景 cue、可迁移操作 lesson、对应执行证据、置信度；
- 组件清单、来源任务、版本、模型与环境元数据；
- 索引，供后续编辑 session 按需检索。

后续任务仍从公共基线 `H0` 开始，而不是直接继承上个任务的高度定制 harness；候选编辑器按证据选择性复用或改写经验。这一点能显著降低任务漂移。

### 2.6 官方实验可作为目标区间，但不能作为 dsh 承诺

论文报告：单步在 WorkBuddy-Bench、JobBench、LAB 上最高分别提升 11.5、4.5、11.8 个百分点；`k=5` 并行递归在单步基础上又有提升。消融中，移除经验库、INV/DOM 分工、合成步骤都会下降。工具错误率在三个评测上均下降。

这些数字依赖具体模型、任务、基础 harness、评测器与大量额外推理，不能直接当作 dsh 的验收指标。dsh 应以自身任务集做配对 A/B，并同时衡量质量、成本、时延、回退率和安全性。

## 3. 产品范围

### 3.1 MVP 必须实现

- dsh 插件安装、启用、禁用和按任务覆盖配置；
- dsh substrate adapter：执行任务、抓取轨迹、抽取交付物、物化 harness；
- 八类 harness 组件的文件化表示、diff、校验和指纹；
- `k=1` 的 Base → INV/DOM → Probe → Compose → Final 流程；
- 编辑器看到完整任务证据，但不能看到评分、标准答案或隐藏 rubric；
- 候选运行隔离、超时、预算和取消；
- `KEEP_BASE`、无交付物回退、编辑器失败回退；
- 全链路事件、token/费用/时延、产物及决策审计；
- dry-run、断点续跑和幂等 run id；
- 一个真实 dsh 任务集上的基线评估报告。

### 3.2 第二阶段

- `k=2..5` parallel recursion；
- `k=2..5` sequential recursion；
- 匿名最终交付物选择器；
- 每领域独立经验库、反思器和按需检索；
- 组件级来源追踪、复用率和多版本管理；
- 质量/成本策略路由：仅对高价值或低置信任务启动递归。

### 3.3 暂不纳入首版

- 修改或训练模型权重；
- 在线读取隐藏评分、答案、grader verdict 或生产用户反馈来修改当前任务；
- 无审核跨租户共享经验；
- 默认允许候选插件执行任意网络、宿主命令或宿主文件写入；
- 自动将上一个任务的完整 harness 直接作为下一个任务的起点；
- 一开始就追求对所有 dsh agent/模型/provider 的全覆盖。

## 4. 总体架构

```text
用户任务
   │
   ▼
dsh Plugin Entry / Policy Gate
   │  是否启用、预算、模式、domain、模型
   ▼
Harness² Orchestrator
   ├── Evidence Builder ── 基线/候选轨迹、交付物、diff、库快照
   ├── INV Editor ─────── 通用执行改进候选
   ├── DOM Editor ─────── 领域改进候选
   ├── Tree Validator ─── 可编辑面、引用、语法、策略、泄漏检查
   ├── dsh Substrate ──── 物化 harness 并启动隔离 rollout
   ├── Composer ───────── 基于行为对照形成 successor harness
   ├── Blind Selector ─── k>1 时只看匿名交付物
   └── Reflector ───────── 提取证据充分的可迁移经验
            │
            ├── Run Store：不可变轨迹、产物、决策、指标
            └── Domain Library：被采用 harness + EXPERIENCE + index
```

### 4.1 Cordis 插件协作

| 插件 | 触发点/依赖 | 职责 |
|---|---|---|
| Trace/Proposer | `agent/pre-step`、`agent/turn-stopping`、`subagent/start` | 落盘 reference trace；启动编辑者；生成 INV/DOM 最小修改 |
| Prober | `subagent_fork` + DSH sandbox | 固定任务与匹配配置，用候选 harness 独立执行并返回对照轨迹 |
| Composer | Prober 完成事件或内部工作流事件 | 对比行为差异，合并、修订、采纳或 `KEEP_BASE` |
| Reflector | 最终交付完成后的内部事件 | 做 edit attribution，产生最多一条有证据的迁移经验 |
| Experience Store | storage service | 按租户/项目/领域保存 harness、经验、索引和版本 |

这里的“四个协作插件”是逻辑职责；Trace 可并入 Proposer，也可作为公共 observability service。对外仍以一个 `dsh-plugin-harness2` 包安装、配置和版本化，避免用户手工拼装不兼容版本。

核心约束：算法层的 `Orchestrator`、`Harness Tree`、`Library` 不引用 dsh 具体类；Cordis 插件入口和 `DshSubstrateAdapter` 依赖 dsh SDK。插件之间使用内部事件/服务契约通信，不通过全局可变对象共享状态。

## 5. 建议模块和仓库结构

```text
plugins/dsh-plugin-harness2/
├── plugin.yaml                 # 插件声明、版本、能力、权限
├── src/
│   ├── index.*                 # 统一安装入口
│   ├── cordis/
│   │   ├── proposer-plugin.*   # trace + INV/DOM 编辑调度
│   │   ├── prober-plugin.*     # subagent_fork + sandbox rollout
│   │   ├── composer-plugin.*   # 对照、合成与最终候选
│   │   ├── reflector-plugin.*  # edit attribution/经验提炼
│   │   └── experience-store.*  # 持久化服务
│   ├── config.*                # 配置、默认值、schema
│   ├── core/
│   │   ├── orchestrator.*      # 任务流与状态机
│   │   ├── recursion.*         # k=1/parallel/sequential
│   │   ├── proposer.*          # INV/DOM editor channel
│   │   ├── composer.*
│   │   ├── selector.*
│   │   ├── reflector.*
│   │   ├── harness-tree.*      # 读写、diff、validate、fingerprint
│   │   ├── evidence.*          # 安全构建上下文
│   │   ├── library.*
│   │   └── run-ledger.*
│   ├── adapters/
│   │   └── dsh-substrate.*
│   ├── policy/
│   │   ├── budget.*
│   │   ├── leakage.*
│   │   └── sandbox.*
│   ├── storage/
│   │   ├── run-store.*
│   │   └── library-store.*
│   └── observability/
│       ├── events.*
│       └── metrics.*
├── prompts/                    # 版本化的编辑、合成、选择、反思任务
├── schemas/                    # config/run/experience/event JSON Schema
├── fixtures/                   # 假模型、假 adapter、确定性 demo
├── tests/
│   ├── unit/
│   ├── contract/
│   ├── integration/
│   ├── security/
│   └── eval/
└── docs/
```

若 dsh 是单仓库，以上作为其 `plugins/` 子目录；若 dsh 插件独立发布，则保持模块边界，使用 dsh SDK 作为 peer dependency。

## 6. 关键接口草案

以下是语言无关的概念接口，名称在完成 dsh API 盘点后调整。

```ts
interface DshHarnessSubstrate {
  surface(): HarnessSurfaceSpec;
  baseHarness(ctx: TaskContext): Promise<HarnessTree>;
  materialize(tree: HarnessTree, ctx: TaskContext): Promise<InstalledHarness>;
  execute(req: RolloutRequest, harness: InstalledHarness): Promise<RunArtifact>;
  trajectory(run: RunArtifact, limits: ReadLimits): Promise<NormalizedTrajectory>;
  delivered(run: RunArtifact): Promise<boolean>;
  deliverables(run: RunArtifact): Promise<Deliverable[]>;
  validate(tree: HarnessTree, ctx: TaskContext): Promise<ValidationResult>;
}

interface Harness2Plugin {
  plan(task: TaskContext, policy: HarnessPolicy): Promise<RunPlan>;
  run(plan: RunPlan, signal: AbortSignal): Promise<Harness2Result>;
  resume(runId: string, signal: AbortSignal): Promise<Harness2Result>;
}
```

建议注册的内部 Cordis 事件（以实际 SDK 命名为准）：

```text
harness2/run-planned
harness2/reference-ready
harness2/candidate-ready
harness2/probe-finished
harness2/composition-finished
harness2/selection-finished
harness2/reflection-finished
harness2/run-finished
```

事件 payload 只传 `run_id/stage_id/artifact_uri/hash` 等引用，较大的轨迹与交付物写入 Run Store，避免事件总线复制大对象或泄露敏感内容。

`RunArtifact` 必须有稳定字段：

```text
run_id, task_id, domain, stage, parent_stage,
model_id, model_config_hash, environment_hash, harness_fingerprint,
started_at, ended_at, status, delivered,
trajectory_uri, deliverable_manifest_uri,
input_tokens, output_tokens, cached_tokens, cost, tool_calls, tool_errors
```

建议插件入口只拦截顶层任务，不递归拦截内部 rollout；内部请求必须带 `harness2.internal=true`，防止插件自触发形成无限递归。

## 7. Harness 表示、校验和存储

### 7.1 文件化表示

推荐用逻辑路径而不是绑定某个 agent 的真实文件名：

```text
harness/
├── system.md
├── guardrails.md
├── memory.md
├── tool-guidance.md
├── skills/<name>/SKILL.md
├── skills/<name>/scripts/*
├── subagents/<name>/AGENT.md
├── scripts/*
└── plugins/<name>/*
```

adapter 负责把逻辑树转换为 dsh 原生配置。每次修改保存 canonical diff 和 SHA-256 指纹，禁止覆盖基线。

### 7.2 提交前校验

候选 harness 必须先通过静态校验，失败时把精确错误反馈给编辑器重试一次；第二次仍失败则继承本轮起始 harness，并记录 fallback。

校验至少包括：

- 路径 allowlist、大小上限、文件数量上限、UTF-8 和规范化路径；
- skill 名称、触发条件、脚本引用必须存在；
- 脚本语法/编译检查和依赖 allowlist；
- plugin hook 只能注册允许的生命周期点；
- 禁止密钥读取、宿主绝对路径、越权网络、动态下载执行；
- 防止软链接、`..`、大小写碰撞和压缩炸弹；
- always-on 上下文 token 上限；
- 防止任务内容改变交付物合同；
- 树中不能出现 grader、rubric、隐藏答案或评分结果；
- 所有引用资源可物化，插件与脚本可在隔离环境启动。

### 7.3 经验库一致性

- 按 `tenant/project/domain/method-version` 分区；
- 先写临时记录，反思与完整性检查成功后原子提交；
- 不足以归因时保存 edit rows，但不生成可迁移经验，等价于 `NO_ENTRY`；
- parallel 与 sequential 使用独立库，避免实验互相污染；
- 支持快照、回滚、TTL、人工禁用与删除；
- 经验内容进入未来模型上下文前按不可信数据处理，不能当作系统指令直接执行。

## 8. 开发工作步骤与内容

### 8.1 阶段 0：dsh 现状盘点与接口冻结（2–4 人日）

工作内容：

- 找到 dsh 插件 manifest、注册方式、生命周期 hooks、配置加载和权限模型；
- 核对 `agent/pre-step` waterfall、`agent/request`、`agent/turn-stopping`、`subagent/start`、`subagent_fork` 的真实 SDK 签名、优先级和错误语义；
- 找到 system prompt、memory、skill、tool、subagent、middleware 的扩展点；
- 确认如何启动一个独立且不被当前插件再次拦截的 dsh session；
- 确认轨迹格式、tool call/result、usage、费用和交付物读取方式；
- 确认 workspace 克隆/快照、sandbox、网络、超时、取消和并发接口；
- 选定一个模型 provider、一个 dsh agent 类型和 10–20 个代表任务作为首个 vertical slice；
- 输出 dsh capability matrix 与 Adapter Decision Record。

退出条件：八类组件至少能映射 C1、C2、C4、C6、C7；能隔离启动 rollout；能得到规范化轨迹、交付物和 usage。缺失能力要列为 dsh 核心前置改造，不能在插件中伪造。

### 8.2 阶段 1：插件骨架与确定性演示（3–5 人日）

工作内容：

- 建立统一发布包以及 Proposer、Prober、Composer、Reflector、Experience Store 的 Cordis 注册、配置 schema、启停命令和 health check；
- 实现状态机、事件协议、run directory 和结构化日志；
- 用 fake editor + fake substrate 做完全确定性的 `k=1` demo；
- 实现 dry-run，展示预计 rollout 数、并发、token/费用上限和可编辑面；
- 实现幂等 run id、摘要文件和中断后 resume。

退出条件：无模型凭证也能跑通 demo；重复执行不会重复扣费或覆盖产物；取消能传递到所有子运行。

### 8.3 阶段 2：Harness Tree 与安全校验（4–7 人日）

工作内容：

- 实现八类逻辑组件、base snapshot、read/write/diff/fingerprint；
- 完成路径、脚本、skill trigger、hook、token、引用完整性校验；
- 验证 C1/C2 经 `agent/pre-step` 注入、C4 经 `agent/request` 调整时的优先级与冲突合并规则；
- 定义候选只可写的 staging workspace；
- 加入 prompt-injection 边界：任务、来源文件、轨迹和经验一律标记为 data；
- 建立恶意候选 fixtures 和安全回归测试。

退出条件：候选不能修改任务源文件、运行存储、评分信息和 dsh 宿主配置；非法树第一次得到可操作反馈，第二次失败安全回退。

### 8.4 阶段 3：dsh Substrate Adapter（5–10 人日）

工作内容：

- 从 dsh 当前配置导出逻辑 base harness；
- 把 Harness Tree 物化到隔离 dsh session；
- 通过 `subagent/start` 启动编辑角色，通过 `subagent_fork` 创建匹配的 Probe，并验证内部任务不会二次触发本插件；
- 启动/取消任务，固定模型、温度、工具集、环境和输入；
- 将 dsh 原生事件转为统一 `[ACTION]/[OBSERVATION]/[ERROR]` 轨迹；
- 抽取文本及非文本交付物的清单、可读表示和内容 hash；
- 检测“有 session 但没有交付物”的失败；
- 加 preflight：凭证、模型、插件版本、工作区、sandbox、存储与预算。

退出条件：同一任务可用两个不同 harness 独立执行；运行之间文件、上下文和工具状态不泄漏；完整记录环境与 harness 指纹。

### 8.5 阶段 4：`k=1` 对照改进闭环（6–10 人日）

工作内容：

- 实现安全 Evidence Builder；
- 编写并版本化 INV、DOM、Composer 三个角色提示词；
- 并发生成 INV/DOM 候选，校验后各试跑一次；
- Composer 能选择 merge、revise、adopt 或 `KEEP_BASE`；
- 执行 composed harness，并在单候选场景直接交付；
- 实现失败策略和逐阶段 ledger；
- 对所有 decision 记录所引用的轨迹时刻和 diff。

退出条件：一个真实 dsh 任务能产生 `base + inv + dom + composed` 四次 rollout 和完整审计链；任一编辑/候选失败不影响安全返回基线或已交付结果。

### 8.6 阶段 5：选择器与递归扩展（5–8 人日）

工作内容：

- 实现 parallel `k=2..5`，限制 propose 与 rollout 两类并发；
- 实现 sequential `k=2..5`，每轮携带 base set 和历史证据；
- 匿名化最终交付物，不暴露 base/adapted、生成顺序或 harness 来源；
- 选择器只选择已有交付物，不合成新答案；
- 选择失败优先回退到已成功交付的 base，否则选第一个有效 final；
- 增加预算中止：达到 token、费用、时长或失败率阈值后不再开新阶段。

退出条件：实际 stage/rollout 数与计划一致；parallel/sequence 可恢复；选择映射可审计但对选择器不可见。

### 8.7 阶段 6：持续经验库（5–8 人日）

工作内容：

- 反思器逐组件比较 candidate 与 base，产出 helped/hurt/no-effect/confounded；
- 只允许以具体行为对照支撑最多一条可迁移经验；
- 保存 adopted tree、experience、provenance 和 index；
- 下一任务按 domain 检索，但从公共 `H0` 开始编辑；
- 实现无库、只读库、读写库、leave-one-out 和跨领域关闭等实验开关；
- 增加人工查看、禁用、回滚和清空特定分区的管理命令。

退出条件：任务 B 能检索任务 A 的经验；禁用库后结果与无库路径一致；`NO_ENTRY` 不污染索引；不同租户和实验模式完全隔离。

### 8.8 阶段 7：可观测性与运营控制（3–6 人日）

工作内容：

- Dashboard：成功率、交付率、质量代理、token、费用、p50/p95 时延、工具错误率；
- 分 stage 展示 fallback、无交付、校验失败、selector 选择和经验写入；
- 记录 prompt version、插件版本、dsh 版本、provider/model、环境 fingerprint；
- 配置按 tenant/domain/task risk 的 enable、采样、预算和 kill switch；
- 敏感数据脱敏、日志保留期和审计导出。

退出条件：一次质量回退可以定位到任务、harness diff、模型调用、工具错误和选择决定；可一键停用自动修改并回到 base。

### 8.9 阶段 8：评估、灰度与发布（7–12 人日，不含任务标注）

工作内容：

- 冻结评测任务、环境、base harness 与 judge；
- 至少 3 个随机种子，做 base、best-of-k、Harness² k=1、parallel、sequential 对比；
- 做经验库、INV/DOM 分工、Composer 三项消融；
- 做恶意输入、经验投毒、脚本逃逸、评分泄漏和资源耗尽测试；
- 先 shadow，再 5%/20%/50% 灰度，满足停止条件自动回退；
- 输出质量—成本 Pareto、适用任务画像和默认策略。

退出条件：达到第 10 节门槛，且至少连续两周没有 P0/P1 安全或数据隔离事件，才允许默认启用到批准的任务域。

## 9. 配置建议

```yaml
harness2:
  enabled: false
  mode: parallel            # parallel | sequential
  k: 1
  domain: auto
  editor_model: <model-id>
  selector_model: <model-id>
  max_parallel_proposals: 2
  max_parallel_rollouts: 2
  budgets:
    max_wall_seconds: 3600
    max_total_tokens: 1000000
    max_cost: 20
    max_tool_calls_per_rollout: 200
  library:
    mode: off               # off | read-only | read-write
    scope: project-domain
    max_entries: 100
    ttl_days: 90
  safety:
    network: deny-by-default
    candidate_plugins: validate-only
    scripts: sandbox
    redact_secrets: true
  fallback:
    on_invalid_tree: inherit
    on_empty_final: delivered-base
    on_selector_failure: delivered-base
```

生产默认建议 `enabled=false, k=1, library=off`，按任务域逐步打开。不要默认开启 `k=5`。

## 10. 提升评估设计

### 10.1 对照组

| 组 | 说明 | 目的 |
|---|---|---|
| Base | 原 dsh harness，一次执行 | 当前基线 |
| Best-of-k Base | 不改 harness，多次执行后盲选 | 区分“多花 token”与“改 harness”的收益 |
| Direct Edit | 看一次 base 后直接改并执行 | 验证 Probe/Compose 的价值 |
| H² k=1 | 一次完整对照改进 | MVP 主实验 |
| H² Parallel k=2/5 | 宽度扩展 | 探索预算曲线 |
| H² Sequential k=2/5 | 深度扩展 | 迭代纠错能力 |
| Ablation | 去库、去 INV/DOM、去 Compose | 归因各模块收益 |

必须按同一任务、同一模型版本、同一工具和环境做配对比较；任务顺序影响经验库，因此跨种子打乱顺序并报告均值、标准差和置信区间。

### 10.2 核心指标

质量：

- `TaskScore`：领域评测器或人工盲评；
- `Win/Tie/Loss vs Base`：同任务成对结果；
- `DeliveryRate`：完整交付物占比；
- `RegressionRate`：比 base 低且超过业务容差的比例；
- `SelectorRegret`：候选池最佳离线得分减去被选结果得分，仅离线分析可见。

效率：

- 每任务 input/output/cached tokens、模型费用；
- 端到端 p50/p95 时延与最大并发；
- tool calls、tool error rate、无效重试；
- `GainPerCost = (Score_H2 - Score_Base) / ExtraCost`；
- 质量—成本 Pareto frontier。

改进机制：

- 候选校验失败率、二次失败回退率、`KEEP_BASE` 率；
- 组件修改分布、复用/改写/新建比例；
- 经验命中率、写入率、`NO_ENTRY` 率；
- 有/无库收益与跨任务 leave-one-out 收益；
- 同一修改在不同模型、domain 的迁移效果。

安全：

- 跨 run/tenant 数据泄漏为 0；
- 隐藏评分/rubric 暴露为 0；
- sandbox escape、未授权网络/文件访问为 0；
- 恶意经验被执行为指令的比例为 0；
- secrets 出现在日志或 Evidence Bundle 的比例为 0。

### 10.3 建议上线门槛

具体阈值应由业务负责人最终确认，初始建议：

- 主要质量指标相对 Base 的 95% 置信区间下界 > 0；
- 任务胜率明显高于败率，严重回退率不高于 Base + 1 个百分点；
- DeliveryRate 不低于 Base；
- tool error rate 不高于 Base；
- `k=1` 的单位收益优于 Best-of-4 Base，证明收益不只是采样次数；
- p95 时延和单任务费用不超过业务批准预算；
- 所有隔离与泄漏安全门槛为硬性 0 事件。

### 10.4 预期收益与现实约束

可合理期待的收益包括：更可靠的工具使用、针对任务补齐 skill/script/guardrail、可复用的领域流程，以及弱模型在特定任务上接近更强模型的表现。

主要代价是额外推理。以官方编排计，一种模式的 executor rollout 约为 `4k`，还包括编辑、选择和反思模型调用；因此该能力不适合所有低价值、强实时任务。最佳产品形态通常是策略路由：复杂、高价值、可异步任务启用，简单或强实时任务保持 base。

## 11. 测试清单

### 11.1 单元与契约测试

- Harness Tree 规范化、diff、fingerprint、路径 allowlist；
- skill trigger、脚本引用、plugin hook、token 限额；
- stage 数、rollout 数、ledger 计费恒等式；
- parallel 与 sequential 历史传递；
- selector 匿名映射稳定且不可从 ID 推断来源；
- experience `NO_ENTRY`、原子提交和索引恢复；
- adapter 的 execute/trajectory/deliverable/validate 契约；
- resume 检查 harness/environment fingerprint，变化时拒绝错误复用。

### 11.2 故障注入

- 编辑器超时、限流、返回空 workspace、产生非法 tree；
- rollout 无输出、部分输出、工具崩溃、进程被取消；
- selector 输出无效 ID；
- reflector 失败或返回无证据经验；
- 磁盘满、索引写失败、进程在原子提交前退出；
- provider 重试导致重复响应和费用记录；
- dsh 升级后事件 schema 改变。

### 11.3 安全测试

- 任务或来源文件伪装成系统命令；
- 轨迹中包含“读取密钥/评分”的注入；
- 候选脚本越目录、读宿主、开网络、fork bomb；
- 插件 hook 阻止工具结果或篡改最终交付；
- 经验库持久化恶意指令；
- 跨 tenant/domain 检索；
- symlink、Unicode 路径混淆、超大 observation 和压缩炸弹。

## 12. 风险与缓解

| 风险 | 表现 | 缓解 |
|---|---|---|
| 选择器选错 | 池中有更优结果但未被采用 | 匿名、按交付/符合/事实/一致/可用排序；离线算 regret；失败回退 |
| 共同错误前提 | 所有候选继承同一误判 | INV/DOM 分工、要求指出冲突、增加挑战性 probe、保留 base |
| 单次运行噪声 | 把偶然成功归因于某个 edit | confounded 标记、多 seed、经验写入高门槛 |
| 任务过拟合 | 当前任务有效、未来任务有害 | 后续从 H0 开始；按 cue 检索；TTL/回滚/人工禁用 |
| 上下文膨胀 | always-on 内容和库持续增长 | token 配额、skill 按需载入、索引检索、定期压缩 |
| 成本和时延失控 | `k` 扩展调用量近似线性增长 | dry-run、硬预算、并发上限、策略路由、早停 |
| 自动代码风险 | script/plugin 获得高权限 | 首版 plugin validate-only；脚本 sandbox；allowlist；签名发布 |
| 评分污染 | 编辑器看到答案或 rubric | 数据分层、Evidence Builder guard、泄漏扫描、评测后置 |
| 插件自递归 | 内部 rollout 再次触发 Harness² | internal 标记和顶层任务 guard |
| dsh API 不稳定 | adapter 随核心升级破坏 | SDK version range、契约测试、capability negotiation |

## 13. 里程碑与人力估算

| 里程碑 | 范围 | 估算 | 交付物 |
|---|---|---:|---|
| M0 | dsh 盘点与 ADR | 2–4 人日 | capability matrix、冻结接口 |
| M1 | 确定性插件骨架 | 3–5 人日 | 可安装插件、demo、resume |
| M2 | 安全 Harness Tree + adapter | 9–17 人日 | 真实 dsh 隔离 rollout |
| M3 | `k=1` MVP | 6–10 人日 | 四 rollout 完整闭环 |
| M4 | parallel/sequential + selector | 5–8 人日 | `k=2..5`、盲选 |
| M5 | 经验库 + 运营 | 8–14 人日 | 持续改进、dashboard、kill switch |
| M6 | 评估与灰度 | 7–12 人日 | A/B 报告、上线决策 |

合计约 **40–70 工程人日**，不含评测任务设计/标注、dsh 核心缺口改造和生产安全评审。两名熟悉 dsh 的工程师加一名评测/Agent 工程师，可按 6–10 周完成首个受控生产版本；这是规划估算，不是已验证排期。

## 14. Definition of Done

`dsh-plugin-harness2` 可视为完成，必须同时满足：

- 插件能在批准的 dsh 版本安装、关闭、dry-run、运行、取消、恢复；
- `k=1`、parallel、sequential 行为与文档一致；
- 八类逻辑组件可表示，dsh 已支持的组件可物化，不支持项明确 capability downgrade；
- 候选全程隔离，非法修改不能触达宿主与基线；
- 每个采用决定能追溯到 harness diff、轨迹、交付物和模型调用；
- 经验库按 tenant/project/domain 隔离并可回滚；
- 失败时始终有确定的降级路径，不因改进插件丢失原本可交付的 base；
- 评估证明相对 Base/Best-of-k 的净收益，且达到质量、成本、时延与安全门槛；
- 有监控、告警、runbook、kill switch、数据保留和版本兼容说明。

## 15. 立即下一步

1. 将 dsh 主仓库或插件 SDK 放入当前 workspace，并提供一个官方示例插件。
2. 完成阶段 0 的 capability matrix，确认插件生命周期和内部 session 启动方式。
3. 选择首个 vertical slice：建议一个可自动校验、有明确交付物、单次运行成本可控的任务域。
4. 先提交 M1 的确定性 fake demo，冻结 run/event/schema，再接真实模型。
5. 用 `k=1` 在 10–20 个任务上跑小样本，只有看到质量信号后再实现 `k>1` 和经验库写入。

## 16. 参考资料与核验范围

- 官方源码：<https://github.com/google-research/harness2>
- 官方论文：<https://arxiv.org/abs/2610.14224>
- 项目网站：<https://harness2.github.io>
- 官方 README、`harness2/core/spec.py`、`recursion.py`、`selection.py`、`library.py`、`tree.py`、`schedule.py`、`substrate/base.py` 与工作流测试已于 2026-10-19 阅读核对。
- 官方版本声明为 `0.1.0`、Apache-2.0；README 同时声明其不是 Google 官方支持产品。
- 本文借鉴其公开方法和接口分层，未把官方 benchmark runner 或第三方 benchmark 代码直接复制进本仓库。真正复用代码时必须保留 Apache-2.0 notice，并分别检查 `third_party/`、数据集和 benchmark 的上游许可证。

