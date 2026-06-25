import Slider from '@material-ui/core/Slider';

const MyComponent = () => (
  <>
{/* TODO(backstage-codemod): finish slider migration manually (complex-onChange) */}
<Slider min={0} max={100} onChange={handleSliderChange} />
</>
);
