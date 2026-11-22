import type { PageTab, IconComponent, PageLayoutTab } from '@backstage/frontend-plugin-api';
type Tab = PageLayoutTab;
// TODO(backstage-codemod): PageTab was removed from @backstage/frontend-plugin-api in 1.57; re-export PageLayoutTab instead.
// TODO(backstage-codemod): IconComponent was removed from @backstage/frontend-plugin-api in 1.57. Use IconElement and pass <MyIcon /> instead of MyIcon (legacy code can import IconComponent from @backstage/core-plugin-api).
export type { PageTab, IconComponent };
