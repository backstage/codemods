

import { Button, Menu, MenuItem, MenuTrigger } from '@backstage/ui';

const MyComponent = () => (
  <>
    
    <MenuTrigger isOpen={open}><Button>Trigger</Button><Menu><MenuItem onAction={handleAction}>Action</MenuItem></Menu></MenuTrigger>
  </>
);
