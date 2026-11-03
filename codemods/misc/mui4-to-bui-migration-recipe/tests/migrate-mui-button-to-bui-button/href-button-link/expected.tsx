import { ButtonLink } from '@backstage/ui';

const MyComponent = () => (
  <ButtonLink variant="secondary" size="medium" iconStart={<DocsIcon />} href="/docs">
    Docs
  </ButtonLink>
);
