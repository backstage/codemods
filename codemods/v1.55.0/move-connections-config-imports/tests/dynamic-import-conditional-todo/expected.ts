// TODO(backstage-codemod): Review dynamic import from '@backstage/connections' — move configuration exports to '@backstage/connections/config' when provenance is clear.
async function load(other: object, cond: boolean) {
  const unrelated = (cond ? await import('@backstage/connections') : other).connectionTypes;
  return unrelated;
}

void load;
