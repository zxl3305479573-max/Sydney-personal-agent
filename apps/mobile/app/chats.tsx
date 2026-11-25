import { PickChatPane } from "../components/pick-chat-pane";
import { useSplitView } from "../lib/split-view";
import { HomeSession } from "./index";

export default function ChatsRoute() {
  const { split } = useSplitView();
  return split ? <PickChatPane /> : <HomeSession />;
}
