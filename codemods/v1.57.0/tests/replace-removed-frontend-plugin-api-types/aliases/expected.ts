import type {
  PageLayoutTab as Tab,
  CreateFrontendPluginOptions as Options,
  ApiRef as Ref,
  ApiFactory as Factory,
  Extension,
} from '@backstage/frontend-plugin-api/alpha';

type Tabs = Array<Tab | keyof Extension<unknown>['attachTo']>;
type Config = Options & {};
type ApiPair = [Ref, Factory];
