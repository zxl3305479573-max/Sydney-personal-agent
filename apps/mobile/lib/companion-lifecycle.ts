let stop: (() => Promise<void>) | undefined;

export function registerCompanionStop(callback: () => Promise<void>) {
  stop = callback;
}

export async function stopCompanionOnSessionChange() {
  await stop?.();
}
