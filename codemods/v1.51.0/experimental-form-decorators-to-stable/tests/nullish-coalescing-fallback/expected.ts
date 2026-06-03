// The fallback `?? EXPERIMENTAL_formDecorators` is a property access,
// not an object key — the codemod must leave it alone so backward-compat
// fallback patterns are preserved.
export function getDecorators(template: any) {
  return {
    formDecorators:
      template.spec.formDecorators ??
      template.spec.EXPERIMENTAL_formDecorators,
  };
}
