import * as UI from '@backstage/ui';

const tabs: UI.HeaderTab[] = [
  { id: 'overview', label: 'Overview', href: '/', matchStrategy: 'prefix' },
  { id: 'docs', label: 'Docs', href: '/docs' },
];

function render(tab: UI.HeaderTab) {
  return tab;
}

const x = someVal as UI.HeaderTab;
