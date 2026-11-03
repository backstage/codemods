import { Header, type HeaderNavTabItem } from '@backstage/ui';

const tabs: HeaderNavTabItem[] = [
  { id: 'overview', label: 'Overview', href: '/' },
];

export function MyPage() {
  return <Header title="My Page" tabs={tabs} />;
}
