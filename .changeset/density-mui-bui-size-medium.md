---
'@backstage/migrate-mui-button-to-bui-button': patch
'@backstage/migrate-mui-icon-button-to-button-icon': patch
'@backstage/migrate-mui-textfield-to-bui-textfield': patch
'@backstage/migrate-mui-chip-to-tag': patch
'@backstage/mui4-to-bui-migration-recipe': patch
---

Preserve MUI medium density on BUI migrations by emitting size="medium" when size is omitted (BUI defaults to small).
