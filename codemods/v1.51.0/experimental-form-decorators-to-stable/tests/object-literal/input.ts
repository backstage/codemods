export const template = {
  apiVersion: 'scaffolder.backstage.io/v1beta3',
  kind: 'Template',
  metadata: {
    name: 'example',
  },
  spec: {
    type: 'service',
    EXPERIMENTAL_formDecorators: [
      {
        decorator: 'my-decorator',
      },
    ],
  },
};
