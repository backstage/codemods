import { Tabs, Tab, TabList } from '@backstage/ui';

const MyComponent = () => (
  <Tabs selectedKey="first">
    <TabList>
      <Tab id="first">First</Tab>
    </TabList>
  </Tabs>
);
