import { HeaderNavTabItem } from '@backstage/ui';

const mapper = (item): HeaderNavTabItem => ({
  label: item.title,
  href: item.path,
  id: item.path,
});

const items = tabs.map((tab): HeaderNavTabItem => ({
  label: tab.title,
  href: mergePaths(manageRoutePath(), tab.path),
  id: tab.path,
}));
