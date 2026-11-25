import { View } from "react-native";
import { HomeSession } from "../../components/inbox-screens";
import { PickChatPane } from "../../components/pick-chat-pane";
import { useMobileTokens } from "../../lib/native";
import { useScreenBackground } from "../../lib/scoped-theme-context";
import { useSplitView } from "../../lib/split-view";

export default function ChatsRoute() {
  const { split } = useSplitView();
  const tokens = useMobileTokens();
  const screenBackground = useScreenBackground(tokens.background);
  return (
    <View style={{ flex: 1, backgroundColor: screenBackground }}>
      {split ? <PickChatPane /> : <HomeSession inTabBar />}
    </View>
  );
}
