import { renderInTestApp } from '@backstage/frontend-test-utils';
import { testApiRef } from './apis';

function MyPage() {
  return null;
}

it('sidebar assertion only', async () => {
  await renderInTestApp(<MyPage />, {
    apis: [[testApiRef, { getData: () => 'test' }]],
  });
  expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
});
