import { type ReactNode } from 'react';
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { Harness2PanelFace } from './controller.ts';
export type Harness2PanelProps = PropsRuntime<'main'> & PropsLocale<'harness2Panel'> & InjectFace<Harness2PanelFace>;
export declare function Harness2Panel({ useHarness2Panel, refresh, selectRun, t }: Harness2PanelProps): ReactNode;
//# sourceMappingURL=Harness2Panel.d.ts.map