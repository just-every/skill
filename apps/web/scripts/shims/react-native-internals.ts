// Fallback shim for React Native internal module paths used during prerender.
const placeholder: any = new Proxy(() => undefined, {
  get: () => placeholder,
  apply: () => placeholder,
});

export const Platform = {
  OS: 'web',
  select: (spec: Record<string, unknown>) => spec?.web ?? spec?.default ?? spec,
};

export default placeholder;
