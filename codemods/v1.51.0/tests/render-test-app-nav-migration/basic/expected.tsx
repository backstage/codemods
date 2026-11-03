import { navItemExtension } from './navExtension';
import { renderTestApp } from '@backstage/frontend-test-utils';

function MyPage() {
  return null;
}

it('shows nav link', async () => {
  await renderTestApp(<MyPage />);
  // TODO(backstage-codemod): verify nav assertions — renderTestApp uses real app shell
  expect(screen.getByRole('link', { name: 'Catalog' })).toBeInTheDocument();
});
