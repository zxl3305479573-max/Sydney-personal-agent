const stops = new Set<() => Promise<void>>();

export function registerCompanionStop(callback: () => Promise<void>): () => void {
  stops.add(callback);
  return () => {
    stops.delete(callback);
  };
}

export async function stopCompanionOnSessionChange() {
  await Promise.allSettled([...stops].map((callback) => callback()));
}
