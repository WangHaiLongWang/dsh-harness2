import type { Context } from '@deepseek-ai/cordis';
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client';
import { type Harness2PanelLocaleKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        harness2Panel: Harness2PanelLocaleKey;
    }
}
export declare const inject: string[];
export declare const PANEL_ID: MainPanelId;
export declare function apply(ctx: Context): void;
export type { Harness2PanelLocaleKey } from './locales.ts';
//# sourceMappingURL=index.d.ts.map