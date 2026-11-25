import { Tabs } from "expo-router";
import { MainBottomNavigation } from "../../components/main-bottom-navigation";
import { ScopedThemeRoute } from "../../components/scoped-theme";
import { AvatarScreenFocus } from "../../lib/avatar-life";
import { BottomSafeAreaClaimedContext } from "../../lib/side-insets";

export default function TabsLayout() {
  return (
    <Tabs
      detachInactiveScreens={false}
      screenOptions={{
        headerShown: false,
        animation: "none",
      }}
      tabBar={(props) => <MainBottomNavigation {...props} />}
      screenLayout={({ route, navigation, children }) => (
        <AvatarScreenFocus navigation={navigation}>
          <ScopedThemeRoute routeName={route.name}>
            <BottomSafeAreaClaimedContext.Provider value={true}>
              {children}
            </BottomSafeAreaClaimedContext.Provider>
          </ScopedThemeRoute>
        </AvatarScreenFocus>
      )}
    >
      <Tabs.Screen name="index" options={{ title: "Sydney" }} />
      <Tabs.Screen name="chats" options={{ title: "Chats" }} />
      <Tabs.Screen name="projects" options={{ title: "Projects" }} />
    </Tabs>
  );
}
