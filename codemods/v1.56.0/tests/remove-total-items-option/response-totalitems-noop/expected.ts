const response = { totalItems: 5, items: [] };
const total = response.totalItems;

function makeResponse(totalItems: number): GetEntitiesResponse {
  return { totalItems, items: [] };
}
