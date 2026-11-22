import type {
  PageTab as Tab,
  PluginOptions as Options,
  ExtensionAttachTo as Attach,
  ProgressProps as Props,
  AnyApiRef as Ref,
  AnyApiFactory as Factory,
} from '@backstage/frontend-plugin-api/alpha';

type Tabs = Array<Tab | keyof Attach>;
type Config = Options & Props;
type ApiPair = [Ref, Factory];
