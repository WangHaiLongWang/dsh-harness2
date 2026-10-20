import { Harness2Panel } from "./Harness2Panel.js";
import { Harness2PanelController } from "./controller.js";
import { Harness2PanelIcon } from "./Harness2PanelIcon.js";
import { en, zh } from "./locales.js";
// Mount this package's generated Remote before waiting on its namespace.
// Declaring remote.harness2Panel here would deadlock activation because Cordis
// resolves top-level inject requirements before apply() can mount it.
export const inject = ['slots', 'locale', 'layout'];
export const PANEL_ID = 'harness2';
export function apply(ctx) {
    ctx.effect(() => ctx.locale.register('harness2Panel', { zh, en }), 'harness2-panel: dictionaries');
    const controller = new Harness2PanelController();
    ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID, locale: 'harness2Panel', inject: () => controller.face() }, Harness2Panel));
    ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: PANEL_ID, order: 15, label: () => ctx.locale.bind('harness2Panel')('panel'), locale: 'harness2Panel' }, Harness2PanelIcon));
}
//# sourceMappingURL=index.js.map