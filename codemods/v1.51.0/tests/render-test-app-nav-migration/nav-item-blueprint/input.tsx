import { NavItemBlueprint } from '@backstage/frontend-plugin-api';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { myNavFeature } from './navFeature';

function MyPage() {
  return null;
}

it('nav blueprint feature', async () => {
  void NavItemBlueprint;
  await renderInTestApp(<MyPage />, {
    features: [myNavFeature],
  });
});
