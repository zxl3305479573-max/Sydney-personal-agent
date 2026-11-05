export async function finishAfterStartup(
  work: Promise<void>,
  animation: Promise<void>,
  finish: () => void,
) {
  try {
    await work;
  } finally {
    await animation;
    finish();
  }
}
