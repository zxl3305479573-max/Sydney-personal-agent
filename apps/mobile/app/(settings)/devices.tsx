import { useQuery } from "@tanstack/react-query";
import { useFocusEffect, useNavigation } from "expo-router";
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { ActivityIndicator, AppState, ScrollView, Text } from "react-native";
import { SettingsGroup, SettingsRow } from "../../components/settings-group";
import { currentApiBase, subscribeApiBase } from "../../lib/api";
import { dateLocaleForUi, useI18n } from "../../lib/i18n";
import { native } from "../../lib/native";
import { queryClient } from "../../lib/query";
import {
  currentReadySessionGeneration,
  currentSessionGeneration,
  subscribeSessionGeneration,
} from "../../lib/session";
import { useSideInsets } from "../../lib/side-insets";
import { DeviceListError, listUserDevices } from "../../lib/user-devices";

export default function Devices() {
  const { t, locale } = useI18n();
  const navigation = useNavigation();
  const insets = useSideInsets();
  const server = useSyncExternalStore(subscribeApiBase, currentApiBase);
  const generation = useSyncExternalStore(subscribeSessionGeneration, currentSessionGeneration);
  const ready = useSyncExternalStore(subscribeSessionGeneration, currentReadySessionGeneration);
  const query = useQuery(
    {
      queryKey: ["user-devices", server, generation],
      queryFn: ({ signal }) => listUserDevices(signal),
      enabled: generation === ready,
      staleTime: 0,
      gcTime: 0,
      retry: false,
    },
    queryClient,
  );
  const refetch = query.refetch;
  const blurGeneration = useRef(0);
  const refreshedBlurGeneration = useRef(0);
  useEffect(
    () =>
      navigation.addListener("blur", () => {
        blurGeneration.current += 1;
      }),
    [navigation],
  );
  useFocusEffect(
    useCallback(() => {
      const refresh = () => {
        if (generation !== ready) return;
        void queryClient.cancelQueries({
          queryKey: ["user-devices", server, generation],
          exact: true,
        });
        void refetch();
      };
      const previous = queryClient.getQueryState(["user-devices", server, generation]);
      if (
        blurGeneration.current !== refreshedBlurGeneration.current ||
        previous?.dataUpdatedAt ||
        previous?.status === "error"
      )
        refresh();
      if (generation === ready) refreshedBlurGeneration.current = blurGeneration.current;
      const subscription = AppState.addEventListener("change", (state) => {
        if (state === "active") refresh();
      });
      return () => subscription.remove();
    }, [server, generation, ready, refetch]),
  );
  const loading = generation !== ready || query.isPending || query.isFetching;
  const error = query.error instanceof DeviceListError ? query.error.kind : "invalid";
  const errorMessage =
    error === "auth"
      ? t("Your session is unavailable or expired. Sign in again.")
      : error === "unavailable"
        ? t("The device API is unavailable. Check the server configuration.")
        : error === "network"
          ? t("Could not reach the server. Check your connection.")
          : error === "timeout"
            ? t("The device request timed out. Try again.")
            : t("Could not load devices.");
  return (
    <ScrollView
      style={[{ flex: 1, backgroundColor: native.groupedPage }, insets]}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 24, paddingBottom: 32, gap: 16 }}
      contentInsetAdjustmentBehavior="automatic"
    >
      {loading ? <ActivityIndicator accessibilityLabel={t("Loading…")} /> : null}
      {!loading && query.isError ? (
        <Text accessibilityRole="alert" style={{ color: native.label }}>
          {errorMessage}
        </Text>
      ) : null}
      {!loading && !query.isError && query.data ? (
        <Text style={{ color: native.label }}>
          {t("Status at {time}; refresh to check again.", {
            time: new Date(query.dataUpdatedAt).toLocaleString(dateLocaleForUi(locale)),
          })}
        </Text>
      ) : null}
      {!loading && !query.isError && query.data?.length === 0 ? (
        <Text style={{ color: native.label }}>{t("No computers paired with this account.")}</Text>
      ) : null}
      {!loading && !query.isError && query.data?.length ? (
        <SettingsGroup>
          {query.data.map((device) => (
            <SettingsRow
              key={device.deviceId}
              title={device.name}
              detail={device.connected ? t("Connected") : t("Offline")}
            />
          ))}
        </SettingsGroup>
      ) : null}
      <SettingsGroup>
        <SettingsRow
          title={query.isError ? t("Retry") : t("Refresh")}
          accessibilityRole="button"
          disabled={loading}
          onPress={() => void query.refetch()}
        />
      </SettingsGroup>
    </ScrollView>
  );
}
