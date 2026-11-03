import { styled } from '@mui/material/styles';

const StyledContainer = styled('div')({
  /* TODO(backstage-codemod): wrapper element was removed — review child/descendant selectors */
  '& .bui-PluginHeaderToolbar > button': {
    color: 'red',
  },
  /* TODO(backstage-codemod): wrapper element was removed — review child/descendant selectors */
  '& .bui-PluginHeaderToolbar .icon': {
    fontSize: '16px',
  },
});
