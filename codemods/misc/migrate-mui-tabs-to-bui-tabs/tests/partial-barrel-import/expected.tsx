import { Button } from '@material-ui/core';
import { Tab, TabList, Tabs } from '@backstage/ui';

const MyComponent = () => (
  <>
    <Tabs defaultSelectedKey="first"><TabList><Tab id="first">First</Tab><Tab id="second">Second</Tab></TabList></Tabs>
    <Button>Keep me</Button>
  </>
);
