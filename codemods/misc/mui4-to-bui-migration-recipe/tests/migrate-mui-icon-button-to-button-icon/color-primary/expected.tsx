import { ButtonIcon } from '@backstage/ui';

const MyComponent = () => (
  <ButtonIcon icon={<FavoriteIcon />} variant="primary" size="medium" aria-label="favorite" onPress={handleFavorite} />
);
