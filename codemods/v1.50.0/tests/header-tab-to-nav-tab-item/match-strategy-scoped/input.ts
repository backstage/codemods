import type { HeaderTab } from '@backstage/ui';

interface RouteConfig {
  path: string;
  matchStrategy: 'prefix' | 'exact';
}

const tabs: HeaderTab[] = [
  { id: 'overview', label: 'Overview', href: '/', matchStrategy: 'prefix' },
];

const routes: RouteConfig[] = [
  { path: '/home', matchStrategy: 'prefix' },
  { path: '/about', matchStrategy: 'exact' },
];
