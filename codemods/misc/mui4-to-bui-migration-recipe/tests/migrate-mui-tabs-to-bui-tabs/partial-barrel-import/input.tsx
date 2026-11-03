import { Tabs, Tab, Button } from '@material-ui/core';

const MyComponent = () => (
  <>
    <Tabs value="first">
      <Tab label="First" value="first" />
      <Tab label="Second" value="second" />
    </Tabs>
    <Button>Keep me</Button>
  </>
);
