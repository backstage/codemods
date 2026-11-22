// TODO(backstage-codemod): PageTab was removed from @backstage/frontend-plugin-api in 1.57; re-export PageLayoutTab instead.
// TODO(backstage-codemod): PluginOptions was removed from @backstage/frontend-plugin-api in 1.57; re-export CreateFrontendPluginOptions instead.
export { PageTab, type PluginOptions as Options } from '@backstage/frontend-plugin-api';
// TODO(backstage-codemod): IconComponent was removed from @backstage/frontend-plugin-api in 1.57. Use IconElement and pass <MyIcon /> instead of MyIcon (legacy code can import IconComponent from @backstage/core-plugin-api).
export type { IconComponent, AnyApiFactory } from '@backstage/frontend-plugin-api/alpha';
// TODO(backstage-codemod): ExtensionAttachTo was removed from @backstage/frontend-plugin-api in 1.57; re-export Extension<unknown>['attachTo'] instead.
// TODO(backstage-codemod): ProgressProps was removed from @backstage/frontend-plugin-api in 1.57; re-export {} instead.
export type { ExtensionAttachTo, ProgressProps } from '@backstage/frontend-plugin-api';
