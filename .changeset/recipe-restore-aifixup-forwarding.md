---
'@backstage/v1-50-0-migration-recipe': patch
'@backstage/v1-51-0-migration-recipe': patch
---

Restore recipe-level `aiFixup` param (`default: false`) and forward it to child codemods that support an AI fixup step via `args: ['aiFixup']`. Fixes recipe runs failing with `params.aiFixup` is not bound when nested codemods evaluate their optional AI step.
