function authenticate<T extends import('@backstage/connections').RootConnectionAuth>() {}
const factory = <T extends Promise<import('@backstage/connections').RootConnectionAuth>>() => null;
type WithDefault<T = import('@backstage/connections').RootConnectionAuth> = T;
function unrelated<T extends import('@backstage/connections/config').RootConnectionAuth>() {}
function foreign<T extends import('other').RootConnectionAuth>() {}
const runtime = import('@backstage/connections').RootConnectionAuth;
