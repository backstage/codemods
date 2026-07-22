import { ButtonIcon } from '@backstage/ui';

const MyComponent = () => (
  <ButtonIcon icon={<CopyIcon />} variant="tertiary" aria-label="copy" className="custom-btn" data-testid="copy-btn" onPress={handleCopy} />
);
