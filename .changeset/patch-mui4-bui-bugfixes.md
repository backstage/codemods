---
'@backstage/migrate-mui-typography-to-text': patch
'@backstage/migrate-mui-layout-to-bui-layout': patch
'@backstage/migrate-mui-icon-button-to-button-icon': patch
---

Fix MUI 4 → BUI transforms: Typography maps only valid TextVariants, Paper never becomes Surface (Box bg=neutral / Card / TODO), and IconButton defaults to tertiary with color + onPress mapping.
