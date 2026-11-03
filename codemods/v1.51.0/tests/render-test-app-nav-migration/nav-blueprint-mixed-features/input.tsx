import { NavItemBlueprint } from '@backstage/frontend-plugin-api';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { myNavFeature } from './navFeature';
import { pageExtension } from './pageExtension';

function MyPage() {
  return null;
}

it('keeps non-nav features when NavItemBlueprint is imported', async () => {
  void NavItemBlueprint;
  await renderInTestApp(<MyPage />, {
    features: [myNavFeature, pageExtension],
  });
});
