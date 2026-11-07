import type { ElectronApplication, Page } from "@playwright/test";
import { expect } from "@playwright/test";

const SPLASH = 'main[aria-label="Sydney 正在启动"]';

/**
 * The startup splash is the first BrowserWindow and is destroyed after its
 * animation. Tests have to use the window that remains, not that splash.
 */
export async function foregroundWindow(app: ElectronApplication): Promise<Page> {
  let page: Page | undefined;
  await expect
    .poll(async () => {
      const ready: Page[] = [];
      let splash = 0;
      for (const window of app.windows()) {
        if (window.isClosed()) continue;
        const isSplash = await window
          .locator(SPLASH)
          .count()
          .catch(() => 0);
        if (isSplash) splash += 1;
        else ready.push(window);
      }
      page = ready.at(-1);
      return splash === 0 && ready.length > 0;
    })
    .toBe(true);
  if (!page) throw new Error("No window remained after the startup splash");
  return page;
}
