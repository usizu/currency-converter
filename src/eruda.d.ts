declare module 'eruda' {
  const eruda: {
    init(options?: Record<string, unknown>): void;
    destroy(): void;
    add(plugin: unknown): void;
  };
  export default eruda;
}

declare module 'eruda-dom' {
  const erudaDom: unknown;
  export default erudaDom;
}
