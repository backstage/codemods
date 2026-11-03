import { PermissionPolicy, PolicyQuery, PolicyQueryUser } from '@backstage/plugin-permission-node';

// The codemod must NOT touch `token` fields in non-PolicyQueryUser patterns,
// even when the file imports from @backstage/plugin-permission-node.
async function handleAutocomplete(req: any) {
  const { token, context } = req.body;
  if (!token) throw new Error('Missing token');
  return { token, context };
}

type AutocompleteHandler = ({ resource, token, context }: {
  resource: string;
  token: string;
  context: Record<string, string>;
}) => Promise<{ results: { id: string }[] }>;

export { handleAutocomplete, AutocompleteHandler };
