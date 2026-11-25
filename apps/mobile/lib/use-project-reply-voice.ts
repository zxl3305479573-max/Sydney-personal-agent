import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";
import type { MobileBot, MobileSnapshot } from "./api";
import { nextAutoSpeakAction } from "./auto-speak";
import { projectScopeKey } from "./project-scope";

export function useProjectReplyVoice(bot: MobileBot | undefined, snapshot: MobileSnapshot | null, scope: string, enabled: boolean) {
  const focused = useRef(false);
  const owner = useRef(Symbol("project-reply"));
  const started = useRef(false);
  const lastBot = useRef<string | null>(null);
  const lastMessage = useRef<string | null>(null);
  const check = useRef(() => {});
  check.current = () => {
    if (!enabled || !bot || bot.archivedAt || scope !== projectScopeKey()) return;
    const decision = nextAutoSpeakAction({
      botId: bot.id, autoSpeak: bot.autoSpeak,
      focused: focused.current && AppState.currentState === "active",
      snapshotReady: snapshot?.botId === bot.id,
      lastSpokenBotId: lastBot.current, lastSpokenMessageId: lastMessage.current,
      runStatus: snapshot?.run?.status, messages: snapshot?.messages ?? [],
    });
    if (decision.action === "wait") return;
    lastBot.current = bot.id;
    lastMessage.current = decision.messageId;
    if (decision.action !== "speak") return;
    void import("./voice").then(({ speakWithDeviceVoice }) => {
      if (!focused.current || !enabled || scope !== projectScopeKey()) return;
      started.current = true;
      return speakWithDeviceVoice(decision.text, bot.id, decision.messageId, owner.current);
    }).catch(() => undefined);
  };
  useFocusEffect(useCallback(() => {
    focused.current = true;
    check.current();
    return () => {
      focused.current = false;
      if (started.current) void import("./voice").then(({ stopSpeaking }) => stopSpeaking(owner.current));
    };
  }, []));
  useEffect(() => { check.current(); }, [bot, snapshot, scope, enabled]);
  useEffect(() => {
    const listener = AppState.addEventListener("change", () => check.current());
    return () => listener.remove();
  }, []);
}
