const NPM_REGISTRY = 'https://registry.npmjs.org'

const versionResolutionCache = new Map<string, string>()

interface NpmLatestResponse {
  version?: string
}

export async function resolveLatestCaretRange(packageName: string): Promise<string | null> {
  const cached = versionResolutionCache.get(packageName)
  if (cached !== undefined) {
    return cached
  }

  try {
    const response = await fetch(`${NPM_REGISTRY}/${encodeURIComponent(packageName)}/latest`)
    if (!response.ok) {
      return null
    }

    const payload = (await response.json()) as NpmLatestResponse
    if (payload.version === undefined) {
      return null
    }

    const range = `^${payload.version}`
    versionResolutionCache.set(packageName, range)
    return range
  } catch {
    return null
  }
}
