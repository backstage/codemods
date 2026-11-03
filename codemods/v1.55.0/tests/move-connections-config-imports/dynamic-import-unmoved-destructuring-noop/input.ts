async function load() {
  const { connectionTypes } = await import('@backstage/connections');
  return connectionTypes;
}

void load;
