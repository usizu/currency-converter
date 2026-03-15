declare module 'eruda' {
  const eruda: {
    init(options?: Record<string, unknown>): void;
    destroy(): void;
  };
  export default eruda;
}
