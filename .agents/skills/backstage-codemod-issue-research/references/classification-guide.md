# Classification guide — codemod vs document-only

Use when a changelog entry might need automation. When in doubt, bias toward **document-only** — a bad codemod is worse than a README note.

## Codemod — file these issues

| Signal | Example |
|--------|---------|
| Removed export with stable replacement | `NavItemBlueprint` → merge into `PageBlueprint` |
| Property → method shape change | `PortableSchema.schema.type` → `schema().type` |
| Removed fields on a typed object | `PolicyQueryUser` field cleanup |
| CSS class / `classNames` key rename | `.bui-Header` removal |
| Test helper behavior change with detectable call sites | `renderInTestApp` + `nav-item` features → `renderTestApp` |
| Deprecation: symbol rename in source | `loading` → `isPending`, `EXPERIMENTAL_formDecorators` → `formDecorators` |
| Config key removed with known path | `catalog.stitchingStrategy.mode: immediate` |

**Ask:** Can an agent write a grep/AST rule that matches >80% of real usages without false positives on unrelated code?

If yes → codemod issue with explicit Detection Criteria.

## Document-only — recipe README / out-of-scope

| Signal | Example |
|--------|---------|
| Default behavior change, no code pattern | Catalog pagination sort-field semantics |
| Security / ops configuration | OIDC CIMD/DCR default pattern |
| External service filtering default | MS Graph disabled-user filtering |
| Dependency version constraint | `@remixicon/react` cap, Zod v4-only bump |
| Optional large migration | React Aria monopackage (could be future codemod — note separately) |
| Deprecated but not removed | `Header.breadcrumbs` still present in target release |
| Upgrade Helper-only dependency bumps | Version pins across `package.json` files |

**Ask:** Would automation require understanding runtime semantics or org-specific policy?

If yes → out-of-scope bullet in recipe issue; no codemod issue.

## Merge vs split

**Merge** when:

- Same file types and transforms commute (order-independent)
- Single package surface and one README story

**Split** when:

- Different languages/targets (TSX vs YAML vs CSS-only)
- Transforms on the same file could conflict if combined
- Different consumer audiences (app authors vs plugin authors vs backend)

Example: one package with two unrelated breaking changes → **two issues** because detection and transforms do not overlap safely in one pass.

## Deprecation vs breaking

Both can be codemods. Label type in the inventory table:

- **breaking** — removal or incompatible change; CI/types fail after upgrade
- **deprecation** — still works but warns; codemod is proactive cleanup

Recipe order convention (from prior releases): **breaking changes first**, grouped by domain, **deprecations last**.

## Registry search before filing

Before adding a row to the inventory:

```bash
npx codemod search "backstage <keyword>"
```

If a published codemod already covers the migration, link it in the inventory **Notes** column instead of filing a duplicate issue.
