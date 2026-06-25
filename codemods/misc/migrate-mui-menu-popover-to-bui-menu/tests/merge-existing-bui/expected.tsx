

import { Button, Menu, MenuItem, MenuTrigger } from '@backstage/ui';

const MyComponent = () => (
  <>
    <Button>Trigger</Button>
    <MenuTrigger isOpen={open}><Menu><MenuItem onAction={handleAction}>Action</MenuItem></Menu></MenuTrigger>
  </>
);
