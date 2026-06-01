import { renderInTestApp } from '@backstage/frontend-test-utils';
import { navItemExtension } from './navExtension';

function MyPage() {
  return null;
}

it('shows nav link', async () => {
  await renderInTestApp(<MyPage />, {
    features: [navItemExtension],
  });
  expect(screen.getByRole('link', { name: 'Catalog' })).toBeInTheDocument();
});
