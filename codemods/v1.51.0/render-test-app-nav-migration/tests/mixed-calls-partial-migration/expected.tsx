import { renderInTestApp, renderTestApp } from '@backstage/frontend-test-utils';
import { navItemExtension } from './navExtension';

function MyPage() {
  return null;
}

it('test A — has nav features', async () => {
  await renderTestApp(<MyPage />);
  expect(screen.getByText('Hello')).toBeInTheDocument();
});

it('test B — no nav features', async () => {
  await renderInTestApp(<MyPage />, {
    apis: [mockApiRef],
  });
  expect(screen.getByText('World')).toBeInTheDocument();
});
