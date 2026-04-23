import * as UI from '@backstage/ui';

const tabs: UI.HeaderNavTabItem[] = [
  { id: 'overview', label: 'Overview', href: '/' },
  { id: 'docs', label: 'Docs', href: '/docs' },
];

function render(tab: UI.HeaderNavTabItem) {
  return tab;
}

const x = someVal as UI.HeaderNavTabItem;
