import { PageLayoutTab } from '@backstage/frontend-plugin-api';
type Outer = PageLayoutTab;
function build<PageTab>(value: PageTab): PageTab {
  return value;
}
