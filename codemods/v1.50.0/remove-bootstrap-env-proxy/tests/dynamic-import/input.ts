async function main() {
  const { bootstrapEnvProxyAgents } = await import('@backstage/cli-common');
  bootstrapEnvProxyAgents();

  // start the backend
}

main();
