import { testApiRef } from './apis';
import { renderTestApp } from '@backstage/frontend-test-utils';

function MyPage() {
  return null;
}

it('sidebar assertion only', async () => {
  await renderTestApp(<MyPage />, {
    apis: [[testApiRef, { getData: () => 'test' }]],
  });
  // TODO(backstage-codemod): verify nav assertions — renderTestApp uses real app shell
  expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
});
