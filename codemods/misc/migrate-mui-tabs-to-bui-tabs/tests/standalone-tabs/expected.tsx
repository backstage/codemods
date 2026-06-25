


const MyComponent = () => (
  <Tabs selectedKey={selected} onSelectionChange={(key) => handleChange(undefined, key)}><TabList><Tab id="first">First</Tab><Tab id="second">Second</Tab></TabList></Tabs>
);
