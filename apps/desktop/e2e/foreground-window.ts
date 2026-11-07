import type { ElectronApplication, Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * The startup splash is the first BrowserWindow and is destroyed after its
 * animation. Tests have to use the window that remains, not that splash.
 */
export async function foregroundWindow(app: ElectronApplication): Promise<Page> {
  let page: Page | undefined;
  await expect
    .poll(async () => {
      const ready: Page[] = [];
      let starting = 0;
      for (const window of app.windows()) {
        if (window.isClosed()) continue;
        const url = window.url();
        if (url === "about:blank" || url === "" || /^file:.*\/splash\.html(?:[?#]|$)/i.test(url))
          starting += 1;
        else ready.push(window);
      }
      page = ready.at(-1);
      return starting === 0 && ready.length > 0;
    })
    .toBe(true);
  if (!page) throw new Error("No window remained after the startup splash");
  return page;
}
