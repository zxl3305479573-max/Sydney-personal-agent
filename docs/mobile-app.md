# Mobile app

Chat with your bots, answer their questions, watch their computers and take calls from your phone.

## Install

- iPhone: [App Store](https://apps.apple.com/app/rakazo/id6801531099).
- Android: [download the APK](https://github.com/elie222/rakazo/releases/download/android/rakazo.apk).

The account menu in the web and desktop apps no longer offers a mobile-app download.

## Sign in

Sign in with your rakazo.com account. To use your own server instead, tap **Use a custom server** on
the sign-in screen and enter its address. For a server on your local network, follow
[Connecting a phone on the same network](./self-host-clients.md#connecting-a-phone-on-the-same-network).

## What you can do

- Chat with bots and groups, attach photos, files or camera shots, and talk instead of typing.
- Answer questions and [approvals](./approvals.md), and save credentials a bot asks for.
- Open a bot's profile to see its **Computer**, **Routines** and settings.
- Take control of a bot's computer, with an on-screen keyboard.
- Call a bot, or answer when a bot calls you. See [Voice and calls](./voice-and-calls.md).
- Connect apps, manage skills, models, voice, approvals, chat apps and your vault from Settings.

The first time you send something, the app asks permission to share it with the AI services your
server uses. Review or withdraw it later in **AI data sharing** in Settings.

In a bot chat, the composer shows the bot's current model. A new bot inherits the space's main
model. Tap the model name to search connected models and see which option is selected. Picking
a model saves it for that bot. Choose **Space default** to inherit the space's main model again.

The current mobile source adds a fixed, full-width **Apps / Projects / GitHub** bottom bar on
Home and the three module lists. Module switches keep one return to Home. Chat, computer,
settings, project details, app connection forms and repository details hide the bar. Apps now
opens on the main stack; existing Settings links and OAuth callbacks keep working. The voice
player sits above the bar, with one owner for the bottom safe area.

The native GitHub screen reuses the server's connection, profile, contribution calendar,
repository search and detail APIs. PAT input clears on submission or when leaving the page.
Bot analysis prepares a draft and preserves any existing draft. Build 4 loads results in the
background when users switch years, filter, search, page through results, or open a repository.
The refresh indicator appears when the user pulls down to refresh. The user confirmed a
successful GitHub connection on build 2. Build 4 is available as an unsigned IPA and awaits
device validation. It caches GitHub connection status under the verified server, account and
space and refreshes it in the background. In **Settings → Account**, tap **Edit avatar** to
choose a photo. Both sides of a chat use translucent glass bubbles. Tapping the current chat
model opens a sheet over the conversation. Add and manage models from Settings. See the
[mobile evaluation](../docx/MOBILE_NAV_GITHUB_EVALUATION.md).

The released `1.0.13` OTA adds **Settings → Software update** and release notes.
**Settings → Account** also shows the native iOS build and running OTA identifier.

The next iOS update flow checks after startup and shows one alert per available update. The
alert and **Settings → Check for updates** show the version and release notes before download.
Tap **Update** to download, then **Install and restart** to apply it immediately. The current
Sydney version appears in **Settings → About**. This flow is implemented in source. A new
sideload build is needed to disable the native startup download configured in build 4.

## What stays on web and desktop

- Creating or editing [routines](./routines.md). On mobile you can pause, delete and review them, or
  ask the bot in chat to set one up.
- [Teach a task](./skills.md#teach-a-task-by-showing-it).
- [Using your own computer](./desktop-app.md) with bots.

## Notifications

Bots notify you when they finish or need input, controlled per bot with
**When it finishes or needs input** in its settings.

On Android, **Notifications** in Settings also lets you choose which kinds you get, including a live
working status while a bot runs.

## Share to a bot

On Android, share text, images, audio, video, PDFs or files from another app to Rakazo and pick the
bot to send them to.
