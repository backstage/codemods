const { items } = await catalogClient.streamEntities(request, {
  limit: 100,
});
