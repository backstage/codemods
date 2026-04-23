async function main() {
  const { bootstrapEnvProxyAgents: setup } = await import('@backstage/cli-common');
  setup();

  // start the backend
}

main();
