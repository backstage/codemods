import type { HeaderTab } from '@backstage/ui';

const tabs: HeaderTab[] = [];
const singleTab: HeaderTab = { id: 'overview', label: 'Overview', href: '/' };
const partial: Partial<HeaderTab> = {};
const assertion = someValue as HeaderTab;

function processTabs(tabs: Array<HeaderTab>): void {
  // process
}
