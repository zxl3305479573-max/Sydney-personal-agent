import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SettingsGroup, SettingsRow } from "../../components/settings-group";
import { getAppVersionInfo } from "../../lib/app-version";
import { useI18n } from "../../lib/i18n";
import { native } from "../../lib/native";
import { useScreenBackground } from "../../lib/scoped-theme-context";
import { useSideInsets } from "../../lib/side-insets";

export default function About() {
  const { t } = useI18n();
  const insets = useSideInsets();
  const screenBackground = useScreenBackground(native.groupedPage);
  const { release, nativeLabel } = getAppVersionInfo();
  const currentVersion = release?.version ?? nativeLabel;

  return (
    <SafeAreaView edges={["bottom"]} style={{ flex: 1, backgroundColor: screenBackground }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        style={insets}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: 16, paddingTop: 24 }}
      >
        <SettingsGroup label="Sydney">
          <SettingsRow title={t("Current version")} value={currentVersion ?? undefined} />
        </SettingsGroup>
      </ScrollView>
    </SafeAreaView>
  );
}
