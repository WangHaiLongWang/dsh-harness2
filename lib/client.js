window.__ModuleLoader__.load({
	id: "dsh-plugin-harness2",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_jsx_runtime = require("react/jsx-runtime");
		let _deepseek_ai_dsh_client_store = require("@deepseek-ai/dsh-client-store");
		//#region src/client/diff.ts
		/** Compute a line diff, using LCS for ordinary Harness files and a bounded fallback for unusually large files. */
		function diffLines(before, after) {
			const left = before.split("\n"), right = after.split("\n");
			if (left.length * right.length > 3e5) return blockDiff(left, right);
			const table = Array.from({ length: left.length + 1 }, () => new Uint16Array(right.length + 1));
			for (let i = left.length - 1; i >= 0; i -= 1) for (let j = right.length - 1; j >= 0; j -= 1) table[i][j] = left[i] === right[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
			const result = [];
			let i = 0, j = 0;
			while (i < left.length || j < right.length) if (i < left.length && j < right.length && left[i] === right[j]) result.push({
				kind: "same",
				text: left[i],
				oldLine: ++i,
				newLine: ++j
			});
			else if (j < right.length && (i === left.length || table[i][j + 1] >= table[i + 1][j])) result.push({
				kind: "add",
				text: right[j],
				newLine: ++j
			});
			else result.push({
				kind: "remove",
				text: left[i],
				oldLine: ++i
			});
			return result;
		}
		function blockDiff(left, right) {
			let prefix = 0;
			while (prefix < left.length && prefix < right.length && left[prefix] === right[prefix]) prefix += 1;
			let suffix = 0;
			while (suffix < left.length - prefix && suffix < right.length - prefix && left[left.length - 1 - suffix] === right[right.length - 1 - suffix]) suffix += 1;
			const result = left.slice(0, prefix).map((text, index) => ({
				kind: "same",
				text,
				oldLine: index + 1,
				newLine: index + 1
			}));
			result.push(...left.slice(prefix, left.length - suffix).map((text, index) => ({
				kind: "remove",
				text,
				oldLine: prefix + index + 1
			})));
			result.push(...right.slice(prefix, right.length - suffix).map((text, index) => ({
				kind: "add",
				text,
				newLine: prefix + index + 1
			})));
			result.push(...left.slice(left.length - suffix).map((text, index) => ({
				kind: "same",
				text,
				oldLine: left.length - suffix + index + 1,
				newLine: right.length - suffix + index + 1
			})));
			return result;
		}
		//#endregion
		//#region \0dsh-css:D:\ProjectS\dsh-harness2\src\client\Harness2Panel.module.css.mjs
		const css = ".c9JVTG_page{box-sizing:border-box;height:100%;color:var(--dsw-alias-label-primary);padding:0 clamp(20px,3vw,40px) 40px;overflow:auto}.c9JVTG_pageHead{justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:24px;padding-top:28px;display:flex}[data-platform=darwin] .c9JVTG_pageHead{padding-top:calc(28px + var(--dsh-frame-top-clearance,0px))}.c9JVTG_pageHead h1{margin:0;font-size:20px;font-weight:500;line-height:28px}.c9JVTG_pageHead p{color:var(--dsw-alias-label-secondary);margin:4px 0 0;font-size:13px;line-height:20px}.c9JVTG_metrics{border-block:.5px solid var(--dsw-alias-border-l2);grid-template-columns:repeat(4,minmax(0,1fr));margin-bottom:20px;display:grid}.c9JVTG_metric{border-right:.5px solid var(--dsw-alias-border-l2);grid-template-columns:1fr auto;align-items:baseline;gap:2px 12px;min-width:0;padding:14px 18px;display:grid}.c9JVTG_metric:last-child{border-right:0}.c9JVTG_metric>span{color:var(--dsw-alias-label-tertiary);font-size:11px}.c9JVTG_metric strong{font:500 18px/24px var(--dsw-font-mono);grid-row:span 2}.c9JVTG_metric small{color:var(--dsw-alias-label-caption);white-space:nowrap;text-overflow:ellipsis;overflow:hidden}.c9JVTG_workspace{border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-1);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);grid-template-columns:minmax(220px,280px) minmax(0,1fr);min-height:560px;display:grid;overflow:hidden}.c9JVTG_workspace>aside{border-right:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);min-width:0;overflow-y:auto}.c9JVTG_workspace>aside>h2{z-index:1;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);margin:0;padding:14px 14px 10px;font-size:12px;font-weight:500;line-height:18px;position:sticky;top:0}.c9JVTG_runRow{box-sizing:border-box;border:0;border-top:.5px solid var(--dsw-alias-border-l3);width:100%;color:inherit;text-align:left;cursor:pointer;background:0 0;flex-direction:column;gap:5px;padding:11px 14px;display:flex}.c9JVTG_runRow:hover{background:var(--dsw-alias-interactive-bg-hover)}.c9JVTG_runRow[data-selected]{background:var(--dsw-alias-bg-layer-1);box-shadow:inset 2px 0 0 var(--dsw-alias-brand-primary)}.c9JVTG_runPrimary,.c9JVTG_runMeta{align-items:center;gap:7px;min-width:0;display:flex}.c9JVTG_runPrimary [class*=tag]{margin-left:auto}.c9JVTG_runId{text-overflow:ellipsis;font:12px/18px var(--dsw-font-mono);overflow:hidden}.c9JVTG_runMeta,.c9JVTG_runTime{color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:15px}.c9JVTG_runTime{white-space:nowrap;text-overflow:ellipsis;overflow:hidden}.c9JVTG_content{min-width:0;padding:20px;overflow:auto}.c9JVTG_section,.c9JVTG_diffSection{margin-bottom:24px}.c9JVTG_section h2,.c9JVTG_diffSection h2{margin:0 0 10px;font-size:13px;font-weight:500;line-height:20px}.c9JVTG_sectionHead{justify-content:space-between;align-items:center;gap:12px;display:flex}.c9JVTG_sectionHead h2{margin-bottom:10px}.c9JVTG_pipeline{align-items:stretch;gap:1px;padding-bottom:4px;display:flex;overflow-x:auto}.c9JVTG_stage{border-block:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);gap:2px;min-width:92px;padding:9px 12px;display:grid;position:relative}.c9JVTG_stage:first-child{border-left:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm) 0 0 var(--dsw-radius-sm)}.c9JVTG_stage:last-child{border-right:.5px solid var(--dsw-alias-border-l2);border-radius:0 var(--dsw-radius-sm) var(--dsw-radius-sm) 0}.c9JVTG_stage b{font:500 11px/16px var(--dsw-font-mono)}.c9JVTG_stage>span{color:var(--dsw-alias-label-secondary);white-space:nowrap;font-size:10px}.c9JVTG_stageFlags{color:var(--dsw-alias-label-caption)!important}.c9JVTG_stage[data-state=selected]{box-shadow:inset 0 -2px 0 var(--dsw-alias-brand-primary)}.c9JVTG_stage[data-state=failed]{box-shadow:inset 0 -2px 0 var(--dsw-alias-state-error-primary)}.c9JVTG_compareBar{border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm) var(--dsw-radius-sm) 0 0;background:var(--dsw-alias-bg-layer-2);align-items:center;gap:4px;padding:6px;display:flex;overflow-x:auto}.c9JVTG_compareBar>span{color:var(--dsw-alias-label-tertiary);white-space:nowrap;padding:0 7px;font-size:10px}.c9JVTG_compareBar button,.c9JVTG_files button{border-radius:var(--dsw-radius-xs);color:var(--dsw-alias-label-secondary);font:11px/16px var(--dsw-font-mono);cursor:pointer;white-space:nowrap;background:0 0;border:0;padding:5px 8px}.c9JVTG_compareBar button:hover,.c9JVTG_files button:hover{background:var(--dsw-alias-interactive-bg-hover)}.c9JVTG_compareBar button[data-selected],.c9JVTG_files button[data-selected]{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1)}.c9JVTG_diffBody{border:.5px solid var(--dsw-alias-border-l2);border-radius:0 0 var(--dsw-radius-sm) var(--dsw-radius-sm);border-top:0;grid-template-columns:minmax(120px,180px) minmax(0,1fr);min-height:260px;max-height:520px;display:grid;overflow:hidden}.c9JVTG_files{border-right:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);flex-direction:column;align-items:stretch;gap:2px;padding:7px;display:flex;overflow:auto}.c9JVTG_files button{text-align:left;text-overflow:ellipsis;overflow:hidden}.c9JVTG_code{background:var(--dsw-alias-bg-module-platform);padding-block:6px;overflow:auto}.c9JVTG_codeLine{min-height:20px;font:var(--dsw-font-markdown-code-block-small);grid-template-columns:42px 42px 18px minmax(max-content,1fr);display:grid}.c9JVTG_codeLine>span{color:var(--dsw-alias-label-caption);text-align:right;user-select:none;padding-right:8px}.c9JVTG_codeLine i{color:var(--dsw-alias-label-caption);text-align:center;user-select:none;font-style:normal}.c9JVTG_codeLine code{white-space:pre;padding-right:16px}.c9JVTG_codeLine[data-kind=add]{background:color-mix(in srgb, var(--dsw-alias-state-success-secondary) 38%, transparent)}.c9JVTG_codeLine[data-kind=add] i{color:var(--dsw-alias-state-success-primary)}.c9JVTG_codeLine[data-kind=remove]{background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 9%, transparent)}.c9JVTG_codeLine[data-kind=remove] i{color:var(--dsw-alias-state-error-primary)}.c9JVTG_diffStats{font:10px/16px var(--dsw-font-mono);color:var(--dsw-alias-label-tertiary);gap:10px;display:flex}.c9JVTG_notice,.c9JVTG_empty,.c9JVTG_noChanges{color:var(--dsw-alias-label-tertiary);margin:0;padding:12px;font-size:12px;line-height:18px}.c9JVTG_notice{border-left:2px solid var(--dsw-alias-state-warn-primary);background:var(--dsw-alias-bg-layer-2);margin-bottom:8px}.c9JVTG_noChanges{position:sticky;left:0}.c9JVTG_details{border-top:.5px solid var(--dsw-alias-border-l2);grid-template-columns:repeat(3,minmax(0,1fr));margin:0;display:grid}.c9JVTG_details>div{border-bottom:.5px solid var(--dsw-alias-border-l3);min-width:0;padding:9px 12px}.c9JVTG_details dt{color:var(--dsw-alias-label-tertiary);font-size:10px}.c9JVTG_details dd{text-overflow:ellipsis;font:11px/16px var(--dsw-font-mono);margin:3px 0 0;overflow:hidden}.c9JVTG_errors{border-left:2px solid var(--dsw-alias-state-error-primary);background:var(--dsw-alias-bg-layer-2);margin-top:10px;padding:10px 12px;font-size:11px}.c9JVTG_errors p{overflow-wrap:anywhere;color:var(--dsw-alias-label-secondary);margin:5px 0 0}.c9JVTG_center{text-align:center;align-content:center;place-items:center;min-height:420px;display:grid}.c9JVTG_center h2{margin:0;font-size:16px;font-weight:500}.c9JVTG_center p{max-width:440px;color:var(--dsw-alias-label-secondary);margin:8px 0 16px;font-size:13px;line-height:20px}.c9JVTG_skeleton,.c9JVTG_detailSkeleton{gap:12px;display:grid}.c9JVTG_skeleton span,.c9JVTG_detailSkeleton span{border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-skeleton);height:76px}.c9JVTG_detailSkeleton span:nth-child(2){height:340px}@media (width<=840px){.c9JVTG_metrics{grid-template-columns:repeat(2,1fr)}.c9JVTG_metric:nth-child(2){border-right:0}.c9JVTG_workspace{grid-template-columns:1fr}.c9JVTG_workspace>aside{border-right:0;border-bottom:.5px solid var(--dsw-alias-border-l2);max-height:220px}.c9JVTG_diffBody{grid-template-columns:1fr}.c9JVTG_files{border-right:0;border-bottom:.5px solid var(--dsw-alias-border-l2);flex-direction:row}.c9JVTG_details{grid-template-columns:repeat(2,1fr)}}@media (prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}";
		const tagId = "dsh-plugin-harness2/Harness2Panel.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-plugin-harness2";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var Harness2Panel_module_css_default = {
			"center": "c9JVTG_center",
			"code": "c9JVTG_code",
			"codeLine": "c9JVTG_codeLine",
			"compareBar": "c9JVTG_compareBar",
			"content": "c9JVTG_content",
			"detailSkeleton": "c9JVTG_detailSkeleton",
			"details": "c9JVTG_details",
			"diffBody": "c9JVTG_diffBody",
			"diffSection": "c9JVTG_diffSection",
			"diffStats": "c9JVTG_diffStats",
			"empty": "c9JVTG_empty",
			"errors": "c9JVTG_errors",
			"files": "c9JVTG_files",
			"metric": "c9JVTG_metric",
			"metrics": "c9JVTG_metrics",
			"noChanges": "c9JVTG_noChanges",
			"notice": "c9JVTG_notice",
			"page": "c9JVTG_page",
			"pageHead": "c9JVTG_pageHead",
			"pipeline": "c9JVTG_pipeline",
			"runId": "c9JVTG_runId",
			"runMeta": "c9JVTG_runMeta",
			"runPrimary": "c9JVTG_runPrimary",
			"runRow": "c9JVTG_runRow",
			"runTime": "c9JVTG_runTime",
			"section": "c9JVTG_section",
			"sectionHead": "c9JVTG_sectionHead",
			"skeleton": "c9JVTG_skeleton",
			"stage": "c9JVTG_stage",
			"stageFlags": "c9JVTG_stageFlags",
			"workspace": "c9JVTG_workspace"
		};
		//#endregion
		//#region src/client/Harness2Panel.tsx
		function duration(t, startedAt, endedAt) {
			const value = Date.parse(endedAt) - Date.parse(startedAt);
			if (!Number.isFinite(value) || value < 0) return "—";
			return value < 6e4 ? t("durationSeconds", { seconds: (value / 1e3).toFixed(1) }) : t("durationMinutes", {
				minutes: Math.floor(value / 6e4),
				seconds: Math.round(value % 6e4 / 1e3)
			});
		}
		function tokens(run) {
			return new Intl.NumberFormat(void 0, {
				notation: "compact",
				maximumFractionDigits: 1
			}).format(run.usage.inputTokens + run.usage.outputTokens + run.usage.cachedTokens);
		}
		function statusText(t, status) {
			return t(status);
		}
		function RunRow({ run, selected, onSelect, t }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				className: Harness2Panel_module_css_default.runRow,
				"data-selected": selected || void 0,
				onClick: onSelect,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: Harness2Panel_module_css_default.runPrimary,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: run.status === "completed" ? "done" : run.status === "failed" ? "error" : "idle" }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: Harness2Panel_module_css_default.runId,
								children: run.runId.replace(/^h2-/, "").slice(0, 13)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tag, { children: statusText(t, run.status) })
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: Harness2Panel_module_css_default.runMeta,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t(run.mode) }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("kValue", { value: run.k }) }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
								run.stageCount,
								" ",
								t("stages")
							] })
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: Harness2Panel_module_css_default.runTime,
						children: run.endedAt === "" ? "—" : new Date(run.endedAt).toLocaleString()
					})
				]
			});
		}
		function Metric({ label, value, detail }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: Harness2Panel_module_css_default.metric,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: label }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: value }),
					detail !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: detail })
				]
			});
		}
		function Pipeline({ detail, t }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: Harness2Panel_module_css_default.section,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: t("pipeline") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: Harness2Panel_module_css_default.pipeline,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: Harness2Panel_module_css_default.stage,
							"data-state": "base",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: t("base") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: detail.baseTree === void 0 ? "—" : Object.keys(detail.baseTree).length })]
						}),
						detail.stages.map((stage) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: Harness2Panel_module_css_default.stage,
							"data-state": stage.status,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: stage.label }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
									stage.dimension,
									" · ",
									duration(t, stage.startedAt, stage.endedAt)
								] }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: Harness2Panel_module_css_default.stageFlags,
									children: stage.fellBack ? t("fellBack") : stage.keptBase ? t("keptBase") : stage.delivered ? t("delivered") : t("notDelivered")
								})
							]
						}, stage.label)),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: Harness2Panel_module_css_default.stage,
							"data-state": "selected",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: t("selected") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: detail.chosenLabel || "—" })]
						})
					]
				})]
			});
		}
		function HarnessDiff({ detail, t }) {
			const targets = (0, react.useMemo)(() => [{
				id: "adopted",
				label: t("selected"),
				tree: detail.adoptedTree
			}, ...detail.stages.map((stage) => ({
				id: stage.label,
				label: stage.label,
				tree: stage.tree
			}))], [detail, t]);
			const [targetId, setTargetId] = (0, react.useState)("adopted");
			const target = targets.find((item) => item.id === targetId) ?? targets[0];
			const files = [...new Set([...Object.keys(detail.baseTree), ...Object.keys(target.tree)])].sort();
			const [file, setFile] = (0, react.useState)(files[0] ?? "");
			(0, react.useEffect)(() => {
				setTargetId("adopted");
			}, [detail.runId]);
			(0, react.useEffect)(() => {
				if (!files.includes(file)) setFile(files[0] ?? "");
			}, [file, files]);
			const lines = file === "" ? [] : diffLines(detail.baseTree[file] ?? "", target.tree[file] ?? "");
			const counts = lines.reduce((sum, line) => ({
				add: sum.add + Number(line.kind === "add"),
				remove: sum.remove + Number(line.kind === "remove")
			}), {
				add: 0,
				remove: 0
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: Harness2Panel_module_css_default.diffSection,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: Harness2Panel_module_css_default.sectionHead,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: t("harnessDiff") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: Harness2Panel_module_css_default.diffStats,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
								"+",
								counts.add,
								" ",
								t("added")
							] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
								"−",
								counts.remove,
								" ",
								t("removed")
							] })]
						})]
					}),
					Object.keys(detail.baseTree).length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: Harness2Panel_module_css_default.notice,
						children: t("baseUnavailable")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: Harness2Panel_module_css_default.compareBar,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("compare") }), targets.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							"data-selected": item.id === target.id || void 0,
							onClick: () => setTargetId(item.id),
							children: item.label
						}, item.id))]
					}),
					files.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: Harness2Panel_module_css_default.empty,
						children: t("noFile")
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: Harness2Panel_module_css_default.diffBody,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("nav", {
							className: Harness2Panel_module_css_default.files,
							"aria-label": t("file"),
							children: files.map((name) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								"data-selected": name === file || void 0,
								onClick: () => setFile(name),
								children: name
							}, name))
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: Harness2Panel_module_css_default.code,
							role: "table",
							"aria-label": `${t("harnessDiff")}: ${file}`,
							children: [counts.add === 0 && counts.remove === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: Harness2Panel_module_css_default.noChanges,
								children: t("noChanges")
							}), lines.map((line, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: Harness2Panel_module_css_default.codeLine,
								"data-kind": line.kind,
								role: "row",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: line.oldLine ?? "" }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: line.newLine ?? "" }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", { children: line.kind === "add" ? "+" : line.kind === "remove" ? "−" : " " }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: line.text || " " })
								]
							}, `${index}-${line.kind}`))]
						})]
					})
				]
			});
		}
		function Details({ detail, t }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: Harness2Panel_module_css_default.section,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: t("details") }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dl", {
						className: Harness2Panel_module_css_default.details,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("run") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: detail.runId })] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("chosen") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: detail.chosenLabel || "—" })] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("duration") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: duration(t, detail.startedAt, detail.endedAt) })] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("input") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: detail.usage.inputTokens.toLocaleString() })] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("output") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: detail.usage.outputTokens.toLocaleString() })] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("cached") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: detail.usage.cachedTokens.toLocaleString() })] })
						]
					}),
					detail.errors.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: Harness2Panel_module_css_default.errors,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: t("errors") }), detail.errors.map((error) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: error }, error))]
					})
				]
			});
		}
		function Harness2Panel({ useHarness2Panel, refresh, selectRun, t }) {
			const state = useHarness2Panel((value) => value);
			(0, react.useEffect)(() => {
				if (state.status === "idle") refresh();
			}, [refresh, state.status]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("main", {
				className: Harness2Panel_module_css_default.page,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
						className: Harness2Panel_module_css_default.pageHead,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h1", { children: t("title") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("intro") })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							size: "sm",
							variant: "outline",
							icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconRefreshOutlineRegular, { size: 14 }),
							disabled: state.status === "loading",
							onClick: () => void refresh(),
							children: t("refresh")
						})]
					}),
					state.status === "loading" && state.runs.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: Harness2Panel_module_css_default.skeleton,
						"aria-label": t("loading"),
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {})
						]
					}),
					state.status === "error" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: Harness2Panel_module_css_default.center,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: t("errorTitle") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("errorBody") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								size: "sm",
								variant: "outline",
								onClick: () => void refresh(),
								children: t("retry")
							})
						]
					}),
					state.status === "ready" && state.runs.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: Harness2Panel_module_css_default.center,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: t("emptyTitle") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("emptyBody") })]
					}),
					state.runs.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: Harness2Panel_module_css_default.metrics,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
								label: t("status"),
								value: state.runs[0] === void 0 ? "—" : statusText(t, state.runs[0].status)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
								label: t("tokens"),
								value: state.runs[0] === void 0 ? "—" : tokens(state.runs[0]),
								...state.runs[0] === void 0 ? {} : { detail: `${state.runs[0].usage.cachedTokens.toLocaleString()} ${t("cached")}` }
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
								label: t("cost"),
								value: state.runs[0] === void 0 ? "—" : `$${state.runs[0].usage.cost.toFixed(4)}`
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
								label: t("toolErrors"),
								value: String(state.runs[0]?.usage.toolErrors ?? 0),
								detail: `${state.runs[0]?.fallbackCount ?? 0} ${t("fallbacks")}`
							})
						]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: Harness2Panel_module_css_default.workspace,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("aside", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: t("recentRuns") }), state.runs.map((run) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RunRow, {
							run,
							selected: run.runId === state.selectedId,
							onSelect: () => void selectRun(run.runId),
							t
						}, run.runId))] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: Harness2Panel_module_css_default.content,
							children: state.detail === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: Harness2Panel_module_css_default.detailSkeleton,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {})
								]
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Pipeline, {
									detail: state.detail,
									t
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(HarnessDiff, {
									detail: state.detail,
									t
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Details, {
									detail: state.detail,
									t
								})
							] })
						})]
					})] })
				]
			});
		}
		//#endregion
		//#region src/client/controller.ts
		const INITIAL = {
			status: "idle",
			runs: [],
			selectedId: null,
			detail: null
		};
		var Harness2PanelController = class {
			store = (0, _deepseek_ai_dsh_client_store.createSnapshotStore)(INITIAL);
			generation = 0;
			refresh = async () => {
				const generation = ++this.generation;
				const current = this.store.getSnapshot();
				this.store.set({
					...current,
					status: "loading"
				});
				try {
					const response = await fetch("api/harness2-panel/runs");
					if (!response.ok) throw new Error(`Harness² list returned ${response.status}`);
					const runs = await response.json();
					if (generation !== this.generation) return;
					const selectedId = runs.some((run) => run.runId === current.selectedId) ? current.selectedId : runs[0]?.runId ?? null;
					this.store.set({
						status: "ready",
						runs,
						selectedId,
						detail: null
					});
					if (selectedId !== null) await this.selectRun(selectedId);
				} catch {
					if (generation === this.generation) this.store.set({
						...current,
						status: "error"
					});
				}
			};
			selectRun = async (runId) => {
				const generation = ++this.generation;
				const current = this.store.getSnapshot();
				this.store.set({
					...current,
					selectedId: runId,
					detail: null
				});
				try {
					const response = await fetch(`api/harness2-panel/run?runId=${encodeURIComponent(runId)}`);
					if (!response.ok) throw new Error(`Harness² detail returned ${response.status}`);
					const detail = await response.json();
					if (generation === this.generation) this.store.set({
						...this.store.getSnapshot(),
						detail
					});
				} catch {
					if (generation === this.generation) this.store.set({
						...this.store.getSnapshot(),
						status: "error"
					});
				}
			};
			face() {
				return {
					hooks: { harness2Panel: this.store },
					refresh: this.refresh,
					selectRun: this.selectRun
				};
			}
		};
		//#endregion
		//#region src/client/Harness2PanelIcon.tsx
		function Harness2PanelIcon({ size }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconBranchOutlineRegular, { size });
		}
		//#endregion
		//#region src/client/locales.ts
		/** Simplified Chinese dictionary and key source of truth. */
		const zh = {
			panel: "Harness²",
			title: "Harness²",
			intro: "递归编排、运行证据与 Harness 变更",
			refresh: "刷新",
			retry: "重试",
			loading: "正在读取运行记录…",
			emptyTitle: "尚无 Harness² 运行",
			emptyBody: "在对话中运行 harness2_run 后，这里会显示流程、成本和变更。",
			errorTitle: "无法读取 Harness² 数据",
			errorBody: "请确认面板与 Harness² 使用相同的 dataDir。",
			recentRuns: "最近运行",
			run: "运行",
			status: "状态",
			stages: "阶段",
			tokens: "Tokens",
			cost: "估算成本",
			toolErrors: "工具错误",
			fallbacks: "回退",
			completed: "已完成",
			failed: "失败",
			cancelled: "已取消",
			parallel: "并行",
			sequential: "串行",
			pipeline: "执行流程",
			base: "Base",
			selected: "已采用",
			harnessDiff: "Web Harness Diff",
			compare: "比较目标",
			file: "文件",
			noFile: "两侧均无可比较的 Harness 文件。",
			noChanges: "该文件没有变更。",
			baseUnavailable: "该旧运行未持久化 Base Harness，请新建一次运行后查看完整 Diff。",
			added: "新增",
			removed: "删除",
			unchanged: "未变",
			details: "运行详情",
			chosen: "选中",
			duration: "耗时",
			input: "输入",
			output: "输出",
			cached: "缓存",
			errors: "错误",
			validationIssues: "校验问题",
			delivered: "已交付",
			notDelivered: "未交付",
			keptBase: "保留 Base",
			fellBack: "已回退",
			kValue: "k={value}",
			durationSeconds: "{seconds}s",
			durationMinutes: "{minutes}m {seconds}s"
		};
		const en = {
			panel: "Harness²",
			title: "Harness²",
			intro: "Recursive orchestration, run evidence, and Harness changes",
			refresh: "Refresh",
			retry: "Retry",
			loading: "Reading runs…",
			emptyTitle: "No Harness² runs yet",
			emptyBody: "Run harness2_run in a conversation to see its pipeline, cost, and changes here.",
			errorTitle: "Harness² data is unavailable",
			errorBody: "Make sure the panel and Harness² use the same dataDir.",
			recentRuns: "Recent runs",
			run: "Run",
			status: "Status",
			stages: "Stages",
			tokens: "Tokens",
			cost: "Estimated cost",
			toolErrors: "Tool errors",
			fallbacks: "Fallbacks",
			completed: "Completed",
			failed: "Failed",
			cancelled: "Cancelled",
			parallel: "Parallel",
			sequential: "Sequential",
			pipeline: "Pipeline",
			base: "Base",
			selected: "Adopted",
			harnessDiff: "Web Harness Diff",
			compare: "Compare target",
			file: "File",
			noFile: "Neither side has a Harness file to compare.",
			noChanges: "No changes in this file.",
			baseUnavailable: "This older run did not persist its Base Harness. Create a new run to view a complete diff.",
			added: "Added",
			removed: "Removed",
			unchanged: "Unchanged",
			details: "Run details",
			chosen: "Chosen",
			duration: "Duration",
			input: "Input",
			output: "Output",
			cached: "Cached",
			errors: "Errors",
			validationIssues: "Validation issues",
			delivered: "Delivered",
			notDelivered: "Not delivered",
			keptBase: "Kept Base",
			fellBack: "Fell back",
			kValue: "k={value}",
			durationSeconds: "{seconds}s",
			durationMinutes: "{minutes}m {seconds}s"
		};
		//#endregion
		//#region src/client/index.ts
		const inject = [
			"slots",
			"locale",
			"layout"
		];
		const PANEL_ID = "harness2";
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register("harness2Panel", {
				zh,
				en
			}), "harness2-panel: dictionaries");
			const controller = new Harness2PanelController();
			ctx.slots.inject("main", () => ctx.slots.register({
				name: "main",
				key: PANEL_ID,
				locale: "harness2Panel",
				inject: () => controller.face()
			}, Harness2Panel));
			ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
				name: "sidebar.panellist",
				id: PANEL_ID,
				order: 15,
				label: () => ctx.locale.bind("harness2Panel")("panel"),
				locale: "harness2Panel"
			}, Harness2PanelIcon));
		}
		//#endregion
		exports.PANEL_ID = PANEL_ID;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map