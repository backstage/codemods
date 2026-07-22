import { ButtonIcon } from '@backstage/ui';

const MyComponent = () => (
  <ButtonIcon icon={<FavoriteIcon />} variant="primary" aria-label="favorite" onPress={handleFavorite} />
);
