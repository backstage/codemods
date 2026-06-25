




const MyComponent = () => (
  <Tabs selectedKey={tab} onSelectionChange={(key) => handleChange(undefined, key)}><TabList><Tab id="overview">Overview</Tab><Tab id="details">Details</Tab></TabList><TabPanel id="overview">Content A</TabPanel><TabPanel id="details">Content B</TabPanel></Tabs>
);
