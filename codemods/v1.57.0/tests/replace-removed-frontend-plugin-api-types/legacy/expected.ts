import type { PluginOptions } from '@backstage/backend-plugin-api';
import type { IconComponent } from '@backstage/core-plugin-api';
type Options = PluginOptions;
type Icon = IconComponent;
import type { PageLayoutTab, Extension } from '@backstage/frontend-plugin-api';
type Done = [PageLayoutTab, Extension<unknown>['attachTo']];
