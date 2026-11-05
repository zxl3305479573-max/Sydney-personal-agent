import type { Dispatch, SetStateAction, TouchEvent } from "react";
import { useEffect, useRef, useState } from "react";

const MOBILE_SIDEBAR_SWIPE_EDGE_PX = 32;
const MOBILE_SIDEBAR_SWIPE_DISTANCE_PX = 56;

function isDesktop() {
  return window.matchMedia("(min-width: 768px)").matches;
}

/** True at /app, the phone's chat-list route; a chat route opens its transcript directly. */
export function isChatListPath(pathname: string) {
  return /^\/app\/?$/.test(pathname);
}

function isRtl() {
  return document.documentElement.getAttribute("dir") === "rtl";
}

/** The phone chat list, opened by its button or a swipe in from the leading edge. */
export function useMobileSidebar() {
  const initiallyDesktop = isDesktop();
  const [mobileSidebarOpenState, setMobileSidebarOpenState] = useState(
    () => !initiallyDesktop && isChatListPath(window.location.pathname),
  );
  const [isMobileView, setIsMobileView] = useState(() => !initiallyDesktop);
  const swipeRef = useRef<{ startX: number; startY: number } | null>(null);
  // Whether the user closed the chat list on the route they are still on.
  const listClosed = useRef<{ path: string; closed: boolean } | null>(null);
  const setMobileSidebarOpen: Dispatch<SetStateAction<boolean>> = (next) => {
    setMobileSidebarOpenState((previous) => {
      const resolved = typeof next === "function" ? next(previous) : next;
      const path = window.location.pathname;
      if (isChatListPath(path)) listClosed.current = { path, closed: !resolved };
      return resolved;
    });
  };
  const mobileSidebarOpen = mobileSidebarOpenState;

  useEffect(() => {
    const onList = isChatListPath(window.location.pathname);
    const closedHere =
      listClosed.current?.path === window.location.pathname && listClosed.current.closed;
    if (onList && !closedHere) {
      setMobileSidebarOpenState(true);
    }
    if (!onList) listClosed.current = null;
    const desktop = window.matchMedia("(min-width: 768px)");
    function closeMobileSidebar() {
      setIsMobileView(!desktop.matches);
      if (desktop.matches) setMobileSidebarOpenState(false);
    }
    closeMobileSidebar();
    desktop.addEventListener("change", closeMobileSidebar);
    return () => desktop.removeEventListener("change", closeMobileSidebar);
  });

  const swipeHandlers = {
    onTouchStartCapture: (event: TouchEvent) => {
      if (mobileSidebarOpen || event.touches.length !== 1 || isDesktop()) {
        swipeRef.current = null;
        return;
      }
      const touch = event.touches[0];
      if (!touch) return;
      const startsAtEdge = isRtl()
        ? touch.clientX >= window.innerWidth - MOBILE_SIDEBAR_SWIPE_EDGE_PX
        : touch.clientX <= MOBILE_SIDEBAR_SWIPE_EDGE_PX;
      swipeRef.current = startsAtEdge ? { startX: touch.clientX, startY: touch.clientY } : null;
    },
    onTouchEndCapture: (event: TouchEvent) => {
      const swipe = swipeRef.current;
      swipeRef.current = null;
      const touch = event.changedTouches[0];
      if (!swipe || !touch || mobileSidebarOpen || isDesktop()) {
        return;
      }
      const horizontal = isRtl() ? swipe.startX - touch.clientX : touch.clientX - swipe.startX;
      const vertical = Math.abs(touch.clientY - swipe.startY);
      if (horizontal >= MOBILE_SIDEBAR_SWIPE_DISTANCE_PX && horizontal > vertical * 1.25) {
        setMobileSidebarOpen(true);
      }
    },
    onTouchCancelCapture: () => {
      swipeRef.current = null;
    },
  };

  return { mobileSidebarOpen, setMobileSidebarOpen, swipeHandlers, isMobileView };
}
