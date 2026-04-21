import type { HeaderNavTabItem } from '@backstage/ui';

const tabs: HeaderNavTabItem[] = [];
const singleTab: HeaderNavTabItem = { id: 'overview', label: 'Overview', href: '/' };
const partial: Partial<HeaderNavTabItem> = {};
const assertion = someValue as HeaderNavTabItem;

function processTabs(tabs: Array<HeaderNavTabItem>): void {
  // process
}
