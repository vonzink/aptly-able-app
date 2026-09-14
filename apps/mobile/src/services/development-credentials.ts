export type DevelopmentCredentials = {
  get(): string | undefined;
  set(value: string): void;
  clear(): void;
};

export function createDevelopmentCredentials(): DevelopmentCredentials {
  let value: string | undefined;
  return {
    get: () => value,
    set(next) {
      value = next;
    },
    clear() {
      value = undefined;
    },
  };
}
