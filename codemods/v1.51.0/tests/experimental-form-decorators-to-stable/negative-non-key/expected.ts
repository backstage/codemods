// EXPERIMENTAL_formDecorators was renamed to formDecorators in Backstage 1.51.0
const fieldName = 'EXPERIMENTAL_formDecorators';

function readDecorators(template: { spec?: { EXPERIMENTAL_formDecorators?: unknown[] } }) {
  return template.spec?.EXPERIMENTAL_formDecorators;
}

export { fieldName, readDecorators };
