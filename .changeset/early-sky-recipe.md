---
'@backstage/v1-54-0-migration-recipe': minor
---

Bundle the five Backstage 1.54.0 codemod scripts as local steps in the recipe and remove the standalone packages, so the recipe is the only published 1.54.0 artifact and no nested registry codemod step is used.
