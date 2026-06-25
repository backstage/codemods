import { Menu, MenuItem, MenuTrigger } from '@backstage/ui';

const MyComponent = () => (
  <MenuTrigger isOpen={isOpen}><Menu><MenuItem onAction={doStuff}>Do stuff</MenuItem></Menu></MenuTrigger>
);
