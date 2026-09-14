export interface Disposable {
  dispose(): void;
}

type Schedule = (task: () => void) => void;

export function createReplaySafeLifecycle(
  resource: Disposable,
  schedule: Schedule = queueMicrotask,
) {
  let generation = 0;

  return {
    setup() {
      const ownGeneration = ++generation;
      return () => {
        schedule(() => {
          if (generation === ownGeneration) resource.dispose();
        });
      };
    },
  };
}
