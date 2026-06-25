



import { Button, Tab, TabList, TabPanel, Tabs } from '@backstage/ui';

const MyComponent = () => (
  <Tabs selectedKey={tab} onSelectionChange={(key) => handleChange(undefined, key)}><TabList><Tab id="info">Info</Tab></TabList><TabPanel id="info"><Button>Click</Button></TabPanel></Tabs>
);
