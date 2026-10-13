async function load(other: object, cond: boolean) {
  const unrelated = (cond ? await import('@backstage/connections') : other).connectionTypes;
  return unrelated;
}

void load;
