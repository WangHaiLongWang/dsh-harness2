/** Simplified Chinese dictionary and key source of truth. */
export const zh = {
  panel: 'Harness²', title: 'Harness²', intro: '递归编排、运行证据与 Harness 变更', refresh: '刷新', retry: '重试', loading: '正在读取运行记录…',
  emptyTitle: '尚无 Harness² 运行', emptyBody: '在对话中运行 harness2_run 后，这里会显示流程、成本和变更。',
  errorTitle: '无法读取 Harness² 数据', errorBody: '请确认面板与 Harness² 使用相同的 dataDir。', recentRuns: '最近运行', run: '运行',
  status: '状态', stages: '阶段', tokens: 'Tokens', cost: '估算成本', toolErrors: '工具错误', fallbacks: '回退',
  completed: '已完成', failed: '失败', cancelled: '已取消', parallel: '并行', sequential: '串行',
  pipeline: '执行流程', base: 'Base', selected: '已采用', harnessDiff: 'Web Harness Diff', compare: '比较目标', file: '文件',
  noFile: '两侧均无可比较的 Harness 文件。', noChanges: '该文件没有变更。', baseUnavailable: '该旧运行未持久化 Base Harness，请新建一次运行后查看完整 Diff。',
  added: '新增', removed: '删除', unchanged: '未变', details: '运行详情', chosen: '选中', duration: '耗时', input: '输入', output: '输出', cached: '缓存',
  errors: '错误', validationIssues: '校验问题', delivered: '已交付', notDelivered: '未交付', keptBase: '保留 Base', fellBack: '已回退',
  kValue: 'k={value}', durationSeconds: '{seconds}s', durationMinutes: '{minutes}m {seconds}s',
} satisfies Record<string, string>
export type Harness2PanelLocaleKey = keyof typeof zh
export const en = {
  panel: 'Harness²', title: 'Harness²', intro: 'Recursive orchestration, run evidence, and Harness changes', refresh: 'Refresh', retry: 'Retry', loading: 'Reading runs…',
  emptyTitle: 'No Harness² runs yet', emptyBody: 'Run harness2_run in a conversation to see its pipeline, cost, and changes here.',
  errorTitle: 'Harness² data is unavailable', errorBody: 'Make sure the panel and Harness² use the same dataDir.', recentRuns: 'Recent runs', run: 'Run',
  status: 'Status', stages: 'Stages', tokens: 'Tokens', cost: 'Estimated cost', toolErrors: 'Tool errors', fallbacks: 'Fallbacks',
  completed: 'Completed', failed: 'Failed', cancelled: 'Cancelled', parallel: 'Parallel', sequential: 'Sequential',
  pipeline: 'Pipeline', base: 'Base', selected: 'Adopted', harnessDiff: 'Web Harness Diff', compare: 'Compare target', file: 'File',
  noFile: 'Neither side has a Harness file to compare.', noChanges: 'No changes in this file.', baseUnavailable: 'This older run did not persist its Base Harness. Create a new run to view a complete diff.',
  added: 'Added', removed: 'Removed', unchanged: 'Unchanged', details: 'Run details', chosen: 'Chosen', duration: 'Duration', input: 'Input', output: 'Output', cached: 'Cached',
  errors: 'Errors', validationIssues: 'Validation issues', delivered: 'Delivered', notDelivered: 'Not delivered', keptBase: 'Kept Base', fellBack: 'Fell back',
  kValue: 'k={value}', durationSeconds: '{seconds}s', durationMinutes: '{minutes}m {seconds}s',
} satisfies Record<Harness2PanelLocaleKey, string>

