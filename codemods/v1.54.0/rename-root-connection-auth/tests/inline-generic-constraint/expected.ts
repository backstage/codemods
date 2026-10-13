function authenticate<T extends import('@backstage/connections').ConfiguredConnectionAuth>() {}
const factory = <T extends Promise<import('@backstage/connections').ConfiguredConnectionAuth>>() => null;
type WithDefault<T = import('@backstage/connections').ConfiguredConnectionAuth> = T;
function unrelated<T extends import('@backstage/connections/config').RootConnectionAuth>() {}
function foreign<T extends import('other').RootConnectionAuth>() {}
const runtime = import('@backstage/connections').RootConnectionAuth;
