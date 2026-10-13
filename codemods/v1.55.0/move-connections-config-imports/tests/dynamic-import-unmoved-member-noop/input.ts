async function load() {
  return (await import('@backstage/connections')).connectionTypes;
}

void load;
