const asAuth = value as import('@backstage/connections').ConfiguredConnectionAuth<string>;
const satisfiesAuth = value satisfies import('@backstage/connections').ConfiguredConnectionAuth<string>;
const already = value as import('@backstage/connections').ConfiguredConnectionAuth<string>;
const config = value as import('@backstage/connections/config').RootConnectionAuth<string>;
const runtime = import('@backstage/connections').RootConnectionAuth;
const assertedRuntime = import('@backstage/connections').RootConnectionAuth as unknown;
const checkedRuntime = import('@backstage/connections').RootConnectionAuth satisfies unknown;
