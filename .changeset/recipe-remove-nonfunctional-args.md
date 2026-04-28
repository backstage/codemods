---
'@backstage/v1.50.0-migration-recipe': patch
---

Remove non-functional `aiFixup` param and `args` forwarding from recipe workflow. The Codemod workflow engine does not support param forwarding via `args` on `codemod:` steps. To use AI fixup, run individual codemods with `--param aiFixup=true`.
