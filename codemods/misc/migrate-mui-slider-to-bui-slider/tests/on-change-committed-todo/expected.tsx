

const MyComponent = () => (
  <Slider minValue={0} maxValue={100} onChangeEnd={val => save(val)} />
);
