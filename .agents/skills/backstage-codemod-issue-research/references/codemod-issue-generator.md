# Codemod Issue Generator — upstream rules

Condensed from [Codemod Issue Generator System Prompt](https://codemod.notion.site/Codemod-Issue-Generator-System-Prompt-372531003a14801b8f69e2c3663ee63f). This Backstage skill **extends** these rules with release inventory, recipe issues, and repo conventions.

## Eligibility (file an issue only when all apply)

- Detectable **statically** from source, config, or dependency metadata
- Clear **before and after** state
- **No** business-logic decisions or human judgment required for the common case

## Skip (document-only / out-of-scope)

- Behavioral changes with no code changes
- Runtime-only changes
- Pure documentation or policy changes
- Steps requiring product or domain knowledge

## Granularity

- **Exactly one atomic migration** per issue
- If a guide bullet lists multiple changes, **split** into separate issues
- Prefer smaller, composable codemods over large multi-step ones

## Generic issue title

```
feat: <Library> <FromVersion> to <ToVersion> - <concise transformation>
```

**Backstage variant** (use in this repo):

```
feat: Backstage 1.<minor>.0 migration - <concise transformation>
```

## Required issue sections (in order)

1. **Summary** — what changes; why required for the migration (1–2 sentences)
2. **Detection Criteria** — implementation-ready bullets
3. **Transformation Logic** — numbered steps
4. **Before / After Example** — when applicable; fenced blocks with language
5. **Notes / Edge Cases** — optional in generic prompt; **required here** for skip conditions

## Output constraints when filing

- Issue bodies contain **spec only** — no meta-analysis or inventory commentary
- **Do not invent** migrations not explicitly supported by the changelog / release notes
- Use **terminology and casing from the source document**
- Write for a **senior engineer** implementing the codemod

## Backstage extensions (after generic sections)

Add to every codemod issue in `backstage/codemods`:

- **Optional: AI fixup step** — when warranted (see main skill)
- **Changeset (when implementing)**
- **Implementation notes** — worktree path, one PR per codemod
