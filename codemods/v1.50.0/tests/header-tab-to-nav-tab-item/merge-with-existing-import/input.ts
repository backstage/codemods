import { Header } from '@backstage/ui';
import type { HeaderTab } from '@backstage/ui';

const tabs: HeaderTab[] = [
  { id: 'overview', label: 'Overview', href: '/' },
];

export function MyPage() {
  return <Header title="My Page" tabs={tabs} />;
}
