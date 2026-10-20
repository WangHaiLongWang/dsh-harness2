import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Button, IconRefreshOutlineRegular, StateDot, Tag,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { HarnessRunDetail, HarnessRunSummary } from '../panel/types.ts'
import type { Harness2PanelFace } from './controller.ts'
import { diffLines } from './diff.ts'
import type { Harness2PanelLocaleKey } from './locales.ts'
import css from './Harness2Panel.module.css'

export type Harness2PanelProps = PropsRuntime<'main'> & PropsLocale<'harness2Panel'> & InjectFace<Harness2PanelFace>
type Translate = (key: Harness2PanelLocaleKey, params?: Readonly<Record<string, string | number>>) => string

function duration(t: Translate, startedAt: string, endedAt: string): string {
  const value = Date.parse(endedAt) - Date.parse(startedAt)
  if (!Number.isFinite(value) || value < 0) return '—'
  return value < 60_000
    ? t('durationSeconds', { seconds: (value / 1000).toFixed(1) })
    : t('durationMinutes', { minutes: Math.floor(value / 60_000), seconds: Math.round((value % 60_000) / 1000) })
}
function tokens(run: HarnessRunSummary): string {
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 })
    .format(run.usage.inputTokens + run.usage.outputTokens + run.usage.cachedTokens)
}
function statusText(t: Translate, status: HarnessRunSummary['status']): string { return t(status) }
function RunRow({ run, selected, onSelect, t }: { run: HarnessRunSummary, selected: boolean, onSelect: () => void, t: Translate }): ReactNode {
  return (
    <button type="button" className={css.runRow} data-selected={selected || undefined} onClick={onSelect}>
      <span className={css.runPrimary}><StateDot state={run.status === 'completed' ? 'done' : run.status === 'failed' ? 'error' : 'idle'} />
        <span className={css.runId}>{run.runId.replace(/^h2-/, '').slice(0, 13)}</span><Tag>{statusText(t, run.status)}</Tag></span>
      <span className={css.runMeta}><span>{t(run.mode)}</span><span>{t('kValue', { value: run.k })}</span><span>{run.stageCount} {t('stages')}</span></span>
      <span className={css.runTime}>{run.endedAt === '' ? '—' : new Date(run.endedAt).toLocaleString()}</span>
    </button>
  )
}

function Metric({ label, value, detail }: { label: string, value: string, detail?: string }): ReactNode {
  return <div className={css.metric}><span>{label}</span><strong>{value}</strong>{detail !== undefined && <small>{detail}</small>}</div>
}

function Pipeline({ detail, t }: { detail: HarnessRunDetail, t: Translate }): ReactNode {
  return <section className={css.section}><h2>{t('pipeline')}</h2><div className={css.pipeline}>
    <div className={css.stage} data-state="base"><b>{t('base')}</b><span>{detail.baseTree === undefined ? '—' : Object.keys(detail.baseTree).length}</span></div>
    {detail.stages.map(stage => <div className={css.stage} data-state={stage.status} key={stage.label}>
      <b>{stage.label}</b><span>{stage.dimension} · {duration(t, stage.startedAt, stage.endedAt)}</span>
      <span className={css.stageFlags}>{stage.fellBack ? t('fellBack') : stage.keptBase ? t('keptBase') : stage.delivered ? t('delivered') : t('notDelivered')}</span>
    </div>)}
    <div className={css.stage} data-state="selected"><b>{t('selected')}</b><span>{detail.chosenLabel || '—'}</span></div>
  </div></section>
}

function HarnessDiff({ detail, t }: { detail: HarnessRunDetail, t: Translate }): ReactNode {
  const targets = useMemo(() => [{ id: 'adopted', label: t('selected'), tree: detail.adoptedTree },
    ...detail.stages.map(stage => ({ id: stage.label, label: stage.label, tree: stage.tree }))], [detail, t])
  const [targetId, setTargetId] = useState('adopted')
  const target = targets.find(item => item.id === targetId) ?? targets[0]!
  const files = [...new Set([...Object.keys(detail.baseTree), ...Object.keys(target.tree)])].sort()
  const [file, setFile] = useState(files[0] ?? '')
  useEffect(() => { setTargetId('adopted') }, [detail.runId])
  useEffect(() => { if (!files.includes(file)) setFile(files[0] ?? '') }, [file, files])
  const lines = file === '' ? [] : diffLines(detail.baseTree[file] ?? '', target.tree[file] ?? '')
  const counts = lines.reduce((sum, line) => ({ add: sum.add + Number(line.kind === 'add'), remove: sum.remove + Number(line.kind === 'remove') }), { add: 0, remove: 0 })
  return <section className={css.diffSection}><div className={css.sectionHead}><h2>{t('harnessDiff')}</h2><div className={css.diffStats}><span>+{counts.add} {t('added')}</span><span>−{counts.remove} {t('removed')}</span></div></div>
    {Object.keys(detail.baseTree).length === 0 && <p className={css.notice}>{t('baseUnavailable')}</p>}
    <div className={css.compareBar}><span>{t('compare')}</span>{targets.map(item => <button type="button" key={item.id} data-selected={item.id === target.id || undefined} onClick={() => setTargetId(item.id)}>{item.label}</button>)}</div>
    {files.length === 0 ? <p className={css.empty}>{t('noFile')}</p> : <div className={css.diffBody}>
      <nav className={css.files} aria-label={t('file')}>{files.map(name => <button type="button" key={name} data-selected={name === file || undefined} onClick={() => setFile(name)}>{name}</button>)}</nav>
      <div className={css.code} role="table" aria-label={`${t('harnessDiff')}: ${file}`}>
        {counts.add === 0 && counts.remove === 0 && <div className={css.noChanges}>{t('noChanges')}</div>}
        {lines.map((line, index) => <div className={css.codeLine} data-kind={line.kind} role="row" key={`${index}-${line.kind}`}>
          <span>{line.oldLine ?? ''}</span><span>{line.newLine ?? ''}</span><i>{line.kind === 'add' ? '+' : line.kind === 'remove' ? '−' : ' '}</i><code>{line.text || ' '}</code>
        </div>)}
      </div>
    </div>}
  </section>
}

function Details({ detail, t }: { detail: HarnessRunDetail, t: Translate }): ReactNode {
  return <section className={css.section}><h2>{t('details')}</h2><dl className={css.details}>
    <div><dt>{t('run')}</dt><dd>{detail.runId}</dd></div><div><dt>{t('chosen')}</dt><dd>{detail.chosenLabel || '—'}</dd></div>
    <div><dt>{t('duration')}</dt><dd>{duration(t, detail.startedAt, detail.endedAt)}</dd></div><div><dt>{t('input')}</dt><dd>{detail.usage.inputTokens.toLocaleString()}</dd></div>
    <div><dt>{t('output')}</dt><dd>{detail.usage.outputTokens.toLocaleString()}</dd></div><div><dt>{t('cached')}</dt><dd>{detail.usage.cachedTokens.toLocaleString()}</dd></div>
  </dl>{detail.errors.length > 0 && <div className={css.errors}><b>{t('errors')}</b>{detail.errors.map(error => <p key={error}>{error}</p>)}</div>}</section>
}

export function Harness2Panel({ useHarness2Panel, refresh, selectRun, t }: Harness2PanelProps): ReactNode {
  const state = useHarness2Panel(value => value)
  useEffect(() => { if (state.status === 'idle') void refresh() }, [refresh, state.status])
  return <main className={css.page}><header className={css.pageHead}><div><h1>{t('title')}</h1><p>{t('intro')}</p></div>
    <Button size="sm" variant="outline" icon={<IconRefreshOutlineRegular size={14} />} disabled={state.status === 'loading'} onClick={() => void refresh()}>{t('refresh')}</Button></header>
    {state.status === 'loading' && state.runs.length === 0 && <div className={css.skeleton} aria-label={t('loading')}><span /><span /><span /></div>}
    {state.status === 'error' && <div className={css.center}><h2>{t('errorTitle')}</h2><p>{t('errorBody')}</p><Button size="sm" variant="outline" onClick={() => void refresh()}>{t('retry')}</Button></div>}
    {state.status === 'ready' && state.runs.length === 0 && <div className={css.center}><h2>{t('emptyTitle')}</h2><p>{t('emptyBody')}</p></div>}
    {state.runs.length > 0 && <><div className={css.metrics}>
      <Metric label={t('status')} value={state.runs[0] === undefined ? '—' : statusText(t, state.runs[0].status)} />
      <Metric label={t('tokens')} value={state.runs[0] === undefined ? '—' : tokens(state.runs[0])} {...state.runs[0] === undefined ? {} : { detail: `${state.runs[0].usage.cachedTokens.toLocaleString()} ${t('cached')}` }} />
      <Metric label={t('cost')} value={state.runs[0] === undefined ? '—' : `$${state.runs[0].usage.cost.toFixed(4)}`} />
      <Metric label={t('toolErrors')} value={String(state.runs[0]?.usage.toolErrors ?? 0)} detail={`${state.runs[0]?.fallbackCount ?? 0} ${t('fallbacks')}`} />
    </div><div className={css.workspace}><aside><h2>{t('recentRuns')}</h2>{state.runs.map(run => <RunRow key={run.runId} run={run} selected={run.runId === state.selectedId} onSelect={() => void selectRun(run.runId)} t={t} />)}</aside>
      <div className={css.content}>{state.detail === null ? <div className={css.detailSkeleton}><span /><span /><span /></div> : <><Pipeline detail={state.detail} t={t} /><HarnessDiff detail={state.detail} t={t} /><Details detail={state.detail} t={t} /></>}</div></div></>}
  </main>
}

