import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { Harness2Panel } from './Harness2Panel.tsx'
import { Harness2PanelController } from './controller.ts'
import { Harness2PanelIcon } from './Harness2PanelIcon.tsx'
import { en, zh, type Harness2PanelLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { harness2Panel: Harness2PanelLocaleKey } }
// Mount this package's generated Remote before waiting on its namespace.
// Declaring remote.harness2Panel here would deadlock activation because Cordis
// resolves top-level inject requirements before apply() can mount it.
export const inject = ['slots', 'locale', 'layout']
export const PANEL_ID = 'harness2' as MainPanelId

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register('harness2Panel', { zh, en }), 'harness2-panel: dictionaries')
  const controller = new Harness2PanelController()
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID, locale: 'harness2Panel', inject: () => controller.face() }, Harness2Panel))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: PANEL_ID, order: 15, label: () => ctx.locale.bind('harness2Panel')('panel'), locale: 'harness2Panel' }, Harness2PanelIcon))
}

export type { Harness2PanelLocaleKey } from './locales.ts'
