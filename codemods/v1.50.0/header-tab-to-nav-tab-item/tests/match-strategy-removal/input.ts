import type { HeaderTab } from '@backstage/ui';

const tabs: HeaderTab[] = [
  { id: 'overview', label: 'Overview', href: '/', matchStrategy: 'prefix' },
  { id: 'docs', label: 'Docs', href: '/docs' },
  { id: 'settings', label: 'Settings', href: '/settings', matchStrategy: 'exact' },
];
