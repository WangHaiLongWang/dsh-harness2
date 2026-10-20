import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { Button, IconRefreshOutlineRegular, StateDot, Tag, } from '@deepseek-ai/dsh-client-ui-primitives';
import { diffLines } from "./diff.js";
import css from './Harness2Panel.module.css';
function duration(t, startedAt, endedAt) {
    const value = Date.parse(endedAt) - Date.parse(startedAt);
    if (!Number.isFinite(value) || value < 0)
        return '—';
    return value < 60_000
        ? t('durationSeconds', { seconds: (value / 1000).toFixed(1) })
        : t('durationMinutes', { minutes: Math.floor(value / 60_000), seconds: Math.round((value % 60_000) / 1000) });
}
function tokens(run) {
    return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 })
        .format(run.usage.inputTokens + run.usage.outputTokens + run.usage.cachedTokens);
}
function statusText(t, status) { return t(status); }
function RunRow({ run, selected, onSelect, t }) {
    return (_jsxs("button", { type: "button", className: css.runRow, "data-selected": selected || undefined, onClick: onSelect, children: [_jsxs("span", { className: css.runPrimary, children: [_jsx(StateDot, { state: run.status === 'completed' ? 'done' : run.status === 'failed' ? 'error' : 'idle' }), _jsx("span", { className: css.runId, children: run.runId.replace(/^h2-/, '').slice(0, 13) }), _jsx(Tag, { children: statusText(t, run.status) })] }), _jsxs("span", { className: css.runMeta, children: [_jsx("span", { children: t(run.mode) }), _jsx("span", { children: t('kValue', { value: run.k }) }), _jsxs("span", { children: [run.stageCount, " ", t('stages')] })] }), _jsx("span", { className: css.runTime, children: run.endedAt === '' ? '—' : new Date(run.endedAt).toLocaleString() })] }));
}
function Metric({ label, value, detail }) {
    return _jsxs("div", { className: css.metric, children: [_jsx("span", { children: label }), _jsx("strong", { children: value }), detail !== undefined && _jsx("small", { children: detail })] });
}
function Pipeline({ detail, t }) {
    return _jsxs("section", { className: css.section, children: [_jsx("h2", { children: t('pipeline') }), _jsxs("div", { className: css.pipeline, children: [_jsxs("div", { className: css.stage, "data-state": "base", children: [_jsx("b", { children: t('base') }), _jsx("span", { children: detail.baseTree === undefined ? '—' : Object.keys(detail.baseTree).length })] }), detail.stages.map(stage => _jsxs("div", { className: css.stage, "data-state": stage.status, children: [_jsx("b", { children: stage.label }), _jsxs("span", { children: [stage.dimension, " \u00B7 ", duration(t, stage.startedAt, stage.endedAt)] }), _jsx("span", { className: css.stageFlags, children: stage.fellBack ? t('fellBack') : stage.keptBase ? t('keptBase') : stage.delivered ? t('delivered') : t('notDelivered') })] }, stage.label)), _jsxs("div", { className: css.stage, "data-state": "selected", children: [_jsx("b", { children: t('selected') }), _jsx("span", { children: detail.chosenLabel || '—' })] })] })] });
}
function HarnessDiff({ detail, t }) {
    const targets = useMemo(() => [{ id: 'adopted', label: t('selected'), tree: detail.adoptedTree },
        ...detail.stages.map(stage => ({ id: stage.label, label: stage.label, tree: stage.tree }))], [detail, t]);
    const [targetId, setTargetId] = useState('adopted');
    const target = targets.find(item => item.id === targetId) ?? targets[0];
    const files = [...new Set([...Object.keys(detail.baseTree), ...Object.keys(target.tree)])].sort();
    const [file, setFile] = useState(files[0] ?? '');
    useEffect(() => { setTargetId('adopted'); }, [detail.runId]);
    useEffect(() => { if (!files.includes(file))
        setFile(files[0] ?? ''); }, [file, files]);
    const lines = file === '' ? [] : diffLines(detail.baseTree[file] ?? '', target.tree[file] ?? '');
    const counts = lines.reduce((sum, line) => ({ add: sum.add + Number(line.kind === 'add'), remove: sum.remove + Number(line.kind === 'remove') }), { add: 0, remove: 0 });
    return _jsxs("section", { className: css.diffSection, children: [_jsxs("div", { className: css.sectionHead, children: [_jsx("h2", { children: t('harnessDiff') }), _jsxs("div", { className: css.diffStats, children: [_jsxs("span", { children: ["+", counts.add, " ", t('added')] }), _jsxs("span", { children: ["\u2212", counts.remove, " ", t('removed')] })] })] }), Object.keys(detail.baseTree).length === 0 && _jsx("p", { className: css.notice, children: t('baseUnavailable') }), _jsxs("div", { className: css.compareBar, children: [_jsx("span", { children: t('compare') }), targets.map(item => _jsx("button", { type: "button", "data-selected": item.id === target.id || undefined, onClick: () => setTargetId(item.id), children: item.label }, item.id))] }), files.length === 0 ? _jsx("p", { className: css.empty, children: t('noFile') }) : _jsxs("div", { className: css.diffBody, children: [_jsx("nav", { className: css.files, "aria-label": t('file'), children: files.map(name => _jsx("button", { type: "button", "data-selected": name === file || undefined, onClick: () => setFile(name), children: name }, name)) }), _jsxs("div", { className: css.code, role: "table", "aria-label": `${t('harnessDiff')}: ${file}`, children: [counts.add === 0 && counts.remove === 0 && _jsx("div", { className: css.noChanges, children: t('noChanges') }), lines.map((line, index) => _jsxs("div", { className: css.codeLine, "data-kind": line.kind, role: "row", children: [_jsx("span", { children: line.oldLine ?? '' }), _jsx("span", { children: line.newLine ?? '' }), _jsx("i", { children: line.kind === 'add' ? '+' : line.kind === 'remove' ? '−' : ' ' }), _jsx("code", { children: line.text || ' ' })] }, `${index}-${line.kind}`))] })] })] });
}
function Details({ detail, t }) {
    return _jsxs("section", { className: css.section, children: [_jsx("h2", { children: t('details') }), _jsxs("dl", { className: css.details, children: [_jsxs("div", { children: [_jsx("dt", { children: t('run') }), _jsx("dd", { children: detail.runId })] }), _jsxs("div", { children: [_jsx("dt", { children: t('chosen') }), _jsx("dd", { children: detail.chosenLabel || '—' })] }), _jsxs("div", { children: [_jsx("dt", { children: t('duration') }), _jsx("dd", { children: duration(t, detail.startedAt, detail.endedAt) })] }), _jsxs("div", { children: [_jsx("dt", { children: t('input') }), _jsx("dd", { children: detail.usage.inputTokens.toLocaleString() })] }), _jsxs("div", { children: [_jsx("dt", { children: t('output') }), _jsx("dd", { children: detail.usage.outputTokens.toLocaleString() })] }), _jsxs("div", { children: [_jsx("dt", { children: t('cached') }), _jsx("dd", { children: detail.usage.cachedTokens.toLocaleString() })] })] }), detail.errors.length > 0 && _jsxs("div", { className: css.errors, children: [_jsx("b", { children: t('errors') }), detail.errors.map(error => _jsx("p", { children: error }, error))] })] });
}
export function Harness2Panel({ useHarness2Panel, refresh, selectRun, t }) {
    const state = useHarness2Panel(value => value);
    useEffect(() => { if (state.status === 'idle')
        void refresh(); }, [refresh, state.status]);
    return _jsxs("main", { className: css.page, children: [_jsxs("header", { className: css.pageHead, children: [_jsxs("div", { children: [_jsx("h1", { children: t('title') }), _jsx("p", { children: t('intro') })] }), _jsx(Button, { size: "sm", variant: "outline", icon: _jsx(IconRefreshOutlineRegular, { size: 14 }), disabled: state.status === 'loading', onClick: () => void refresh(), children: t('refresh') })] }), state.status === 'loading' && state.runs.length === 0 && _jsxs("div", { className: css.skeleton, "aria-label": t('loading'), children: [_jsx("span", {}), _jsx("span", {}), _jsx("span", {})] }), state.status === 'error' && _jsxs("div", { className: css.center, children: [_jsx("h2", { children: t('errorTitle') }), _jsx("p", { children: t('errorBody') }), _jsx(Button, { size: "sm", variant: "outline", onClick: () => void refresh(), children: t('retry') })] }), state.status === 'ready' && state.runs.length === 0 && _jsxs("div", { className: css.center, children: [_jsx("h2", { children: t('emptyTitle') }), _jsx("p", { children: t('emptyBody') })] }), state.runs.length > 0 && _jsxs(_Fragment, { children: [_jsxs("div", { className: css.metrics, children: [_jsx(Metric, { label: t('status'), value: state.runs[0] === undefined ? '—' : statusText(t, state.runs[0].status) }), _jsx(Metric, { label: t('tokens'), value: state.runs[0] === undefined ? '—' : tokens(state.runs[0]), ...state.runs[0] === undefined ? {} : { detail: `${state.runs[0].usage.cachedTokens.toLocaleString()} ${t('cached')}` } }), _jsx(Metric, { label: t('cost'), value: state.runs[0] === undefined ? '—' : `$${state.runs[0].usage.cost.toFixed(4)}` }), _jsx(Metric, { label: t('toolErrors'), value: String(state.runs[0]?.usage.toolErrors ?? 0), detail: `${state.runs[0]?.fallbackCount ?? 0} ${t('fallbacks')}` })] }), _jsxs("div", { className: css.workspace, children: [_jsxs("aside", { children: [_jsx("h2", { children: t('recentRuns') }), state.runs.map(run => _jsx(RunRow, { run: run, selected: run.runId === state.selectedId, onSelect: () => void selectRun(run.runId), t: t }, run.runId))] }), _jsx("div", { className: css.content, children: state.detail === null ? _jsxs("div", { className: css.detailSkeleton, children: [_jsx("span", {}), _jsx("span", {}), _jsx("span", {})] }) : _jsxs(_Fragment, { children: [_jsx(Pipeline, { detail: state.detail, t: t }), _jsx(HarnessDiff, { detail: state.detail, t: t }), _jsx(Details, { detail: state.detail, t: t })] }) })] })] })] });
}
//# sourceMappingURL=Harness2Panel.js.map