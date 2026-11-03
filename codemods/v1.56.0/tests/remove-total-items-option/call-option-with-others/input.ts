const { items } = await catalogClient.streamEntities(request, {
  totalItems: true,
  limit: 100,
});
