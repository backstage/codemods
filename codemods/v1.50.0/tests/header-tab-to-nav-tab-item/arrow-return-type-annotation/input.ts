import { HeaderTab } from '@backstage/ui';

const mapper = (item): HeaderTab => ({
  label: item.title,
  href: item.path,
  id: item.path,
});

const items = tabs.map((tab): HeaderTab => ({
  label: tab.title,
  href: mergePaths(manageRoutePath(), tab.path),
  id: tab.path,
}));
