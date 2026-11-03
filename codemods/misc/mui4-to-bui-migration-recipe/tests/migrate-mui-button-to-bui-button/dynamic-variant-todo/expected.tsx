import Button from '@material-ui/core/Button';

const MyComponent = ({ variant }: { variant: string }) => (
  <>
  {/* TODO(backstage-codemod): verify Button intent manually (dynamic-variant) */}
  <Button variant={variant}>Go</Button>
</>
);
