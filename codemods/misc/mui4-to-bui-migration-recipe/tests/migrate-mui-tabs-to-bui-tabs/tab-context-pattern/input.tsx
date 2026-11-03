import TabContext from '@material-ui/lab/TabContext';
import TabList from '@material-ui/lab/TabList';
import Tab from '@material-ui/core/Tab';
import TabPanel from '@material-ui/lab/TabPanel';

const MyComponent = () => (
  <TabContext value={tab}>
    <TabList onChange={handleChange}>
      <Tab label="Overview" value="overview" />
      <Tab label="Details" value="details" />
    </TabList>
    <TabPanel value="overview">Content A</TabPanel>
    <TabPanel value="details">Content B</TabPanel>
  </TabContext>
);
