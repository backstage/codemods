import { PageTab } from '@backstage/frontend-plugin-api';
type Outer = PageTab;
function build<PageTab>(value: PageTab): PageTab {
  return value;
}
