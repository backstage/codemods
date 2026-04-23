import type { HeaderNavTabItem } from '@backstage/ui';

interface RouteConfig {
  path: string;
  matchStrategy: 'prefix' | 'exact';
}

const tabs: HeaderNavTabItem[] = [
  { id: 'overview', label: 'Overview', href: '/' },
];

const routes: RouteConfig[] = [
  { path: '/home', matchStrategy: 'prefix' },
  { path: '/about', matchStrategy: 'exact' },
];
