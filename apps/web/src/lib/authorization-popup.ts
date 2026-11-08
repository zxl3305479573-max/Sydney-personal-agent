export function openAuthorizationPopup(name: string): Window | null {
  const popup = window.open("about:blank", name, "popup,width=560,height=720");
  if (popup) popup.opener = null;
  return popup;
}

export function navigateAuthorizationPopup(popup: Window | null, url: string): void {
  const target = new URL(url, window.location.origin);
  if (target.protocol !== "https:" && target.origin !== window.location.origin) {
    throw new Error("Invalid authorization URL");
  }
  if (popup) popup.location.href = target.href;
  else window.location.assign(target.href);
}
