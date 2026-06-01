import { renderInTestApp } from '@backstage/frontend-test-utils';
import { testApiRef } from './apis';

function MyPage() {
  return null;
}

it('no nav features', async () => {
  await renderInTestApp(<MyPage />, {
    apis: [[testApiRef, { getData: () => 'test' }]],
  });
  expect(screen.getByText('Hello')).toBeInTheDocument();
});
