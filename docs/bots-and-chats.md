# Bots and chats

Each bot is a teammate with one continuous chat, its own instructions and memory, and a computer to
work on.

## Create a bot

Your first bot is created for you when you sign up. To add another, choose **Create** (the **+** at
the top of the sidebar), then **New bot**. Give it a name and choose **Create**.

Then tell it its job in the chat, in plain words. It asks for anything else it needs, such as a
sign-in or an app to connect.

> [!TIP]
> One bot per job works best: an inbox bot, a research bot, a bot for one client. Each keeps its own
> history and memory, so it gets better at that job over time.

## Talk to it

Type in the composer and press Enter. You can keep chatting while a bot works, and **Stop** ends
the current run.

- **Attach file** adds files and images. If the bot's model can't read images, you can still
  send the picture as a file for the bot to work with.
- Type **@** to mention another bot, a group, a routine or a connected app.
- Type **/** at the start of a message to use a [skill](./skills.md).
- Hover a message to **React**, **Reply** or **Copy**. Select text in a reply to quote just that
  part.
- Hold the microphone to talk instead of typing. See [Voice and calls](./voice-and-calls.md).

Bots reply with formatted text, tables, charts and files. Files they send open in a preview and can
be downloaded. Every file a bot has sent is also listed under **Artifacts** in the account menu.

When a bot needs something from you, it posts a card in the chat: a question, an
[approval](./approvals.md), or a request to take over its screen. Cards never block the chat; you
can answer later.

## Bot settings

Click the bot's name at the top of the chat to open its settings.

手机端编辑（PA-021／PA-022，2026-11-27）：进入 Bot 资料页后点击「编辑」，支持新建 Bot 时的全部身份内容：

| 新建时的内容 | 编辑入口与行为 |
| --- | --- |
| Bot 名称 | 点击名称修改，确认后立即保存 |
| 六种人格预设 | 「人格设定 → 人格预设」选择均衡、专业、友善、简洁、创意、老师；也可直接修改或清空人格文本 |
| 个人人格库 | 「人格设定 → 个人人格库」，复用新建页的完整组件：搜索属性、选择性格／语气／角色／兴趣与轻度／适度／明显权重，新增、编辑、删除及选用已保存人格 |
| 内置头像 | 点击顶部头像，在相同的内置头像列表中选择 |
| 相册头像 | 点击顶部头像后选择相册图片，供本次编辑使用并保存到既有本机头像库 |
| 本机头像库 | 点击顶部头像后复用或移除已保存头像；移除库中头像不会修改 Bot 当前头像 |

头像与人格草稿需点击编辑页「保存」后更新当前 Bot；人格库自身的新增／编辑／删除直接修改库，不能替代 Bot 保存。库内容不自动同步修改其他 Bot；手动改过的当前人格草稿也不会被不匹配的库条目覆盖。工作指令仍在「高级」中单独编辑，两者保存时沿用现有指令及版本冲突校验，不互相覆盖。普通 Bot 与项目 Bot 分别使用各自的更新接口；两部分编码后的总长度上限为 20,000 字符，超限时显示提示并禁用保存。资料加载失败时可点「重试」。此项当前为源码与离线验证候选，尚未发布或真机验收；用户反馈的具体编辑报错仍待错误信息与复现步骤确认。

- **Name** and avatar: pick a shape and color, or upload an image.
- **Notifications**: **When it finishes or needs input**.
- **Open work**: the to-do list the bot keeps for itself. You can add, complete or remove items.
- **Memory**: what the bot has written down. See [Memory](./memory.md).

Under **Advanced**:

- **Model** and **Thinking**: override the [model](./models.md) for this bot.
- **Computer**: **Team** or **Private**. See [The bot's computer](./computer.md).
- **Voice**: **Read replies aloud** and the bot's voice.
- **Permissions**: **Allow cross-space bot communication** and
  [**Manage other bots**](./fleet-management.md).
- **Instructions**: the bot's standing instructions. You can also ask the bot in chat to change
  them, or its name, model, thinking, voice and read-aloud; instruction and setting changes
  show **Undo** in the chat. Memory scope stays in Settings, since shared memory changes what the bot can read.
  **Instruction history** lets you restore an earlier version.
- **How other bots see it**: a short description other bots read when deciding whom to ask.
- **Tools**: **Disable a tool** the bot should never use.
- **Export** downloads the bot's setup as a file. **Clear conversation** empties the chat.

## Organize the sidebar

Right-click a bot in the sidebar to **Pin** it, **Move to** a section, **Mark as Unread**,
**Duplicate**, **Archive** or **Delete** it. Archived bots can be restored later.

## Find things

- **Search** in the sidebar searches bots and conversations. Press Cmd+K (Ctrl+K on Windows and
  Linux) to jump to any bot.
- **Activity** in the sidebar lists every run, with filters for status and date. Use it to find a
  run that failed or is waiting on you.
- **Artifacts** in the account menu lists every file bots have made, with search and a date filter.
