import { useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { AppState } from "react-native";
import { refreshPersonalFinance } from "./personal-finance";

export function useFinanceLiveRefresh(month: string): void {
  useFocusEffect(
    useCallback(() => {
      let timer: ReturnType<typeof setInterval> | undefined;
      const refresh = () => void refreshPersonalFinance({ month });
      const stop = () => {
        if (timer !== undefined) clearInterval(timer);
        timer = undefined;
      };
      const start = () => {
        stop();
        refresh();
        timer = setInterval(refresh, 15_000);
      };
      if (AppState.currentState === "active") start();
      const subscription = AppState.addEventListener("change", (next) => {
        if (next === "active") start();
        else stop();
      });
      return () => {
        stop();
        subscription.remove();
      };
    }, [month]),
  );
}
