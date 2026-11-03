function renderInTestApp(element: unknown) {
  return element;
}

function MyPage() {
  return null;
}

it('local helper', async () => {
  await renderInTestApp(<MyPage />, {
    features: [navItemExtension],
  });
});

const navItemExtension = {};
