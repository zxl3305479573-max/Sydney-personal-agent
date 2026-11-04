# 存储划分与迁移方案

更新日期：2026-11-04。

状态：已盘点一台后台和一台云电脑；因后台文件仅约 452 KiB，暂缓对象存储迁移。Web 进程已迁往云电脑试运行，见 [ADR-0013](../../docs/adr/0013-isolated-cloud-web-proposal.md)。下文对象存储步骤仅供未来评估，未执行。

## 1. 目标

减少后台服务器的内存压力，同时保留后台对任务、权限和文件元数据的控制。文件迁移主要影响磁盘与文件缓存，不能假定降低进程 RSS。下表为未来候选划分，而非已经部署的状态：

| 内容 | 目标位置 | 原因 |
| --- | --- | --- |
| Task、Run、Attempt、授权、审计、文件元数据 | 后台 PostgreSQL | 需要事务、RLS 和权限校验 |
| API、Worker、Pi、模型和连接器 | 后台服务器 | 控制面和密钥边界 |
| 当前任务工作区、下载、中间产物 | 云电脑工作区 | 桌面任务本来就在云电脑执行 |
| Agent home、浏览器配置和长期文件 | 云电脑磁盘及加密对象存储 | 保留桌面状态，后台只保留必要缓存 |
| 附件和生成 artifact 内容 | 云电脑侧私有 S3 兼容对象存储 | 从后台本地卷移走大文件 |
| 内容加密密钥和访问凭据 | 后台密钥配置 | 云电脑桌面账号不接触 |
| Pi 原始 JSONL 会话 | 默认不保存 | 避免敏感数据和额外磁盘增长 |

这里的“云电脑侧对象存储”可以是云电脑服务器上的低权限私有 S3 兼容服务，也可以是用户已经提供、与云电脑同一私网或可信网络可达的对象存储。未确认端点前不安装服务、不开放端口。

## 2. 已有实现

仓库已有以下能力，可以直接复用：

- `createAgentHomeStore()`：配置 `OBJECT_STORAGE_BUCKET` 后将 Agent home 保存到对象存储，后台 `DATA_DIR/homes` 可作为缓存。
- `createArtifactStore()`：新 artifact 写入加密对象存储，历史本地 artifact 继续按旧 `storageKey` 读取。
- `home-storage migrate`：上传并校验现有 home，保留本地副本，可重复执行。
- `shared-storage artifacts`：上传并回读校验本地 artifact，再条件更新数据库指针，可重复执行。
- `DeploymentArtifactStore`：对象 artifact 和旧本地 artifact 可以在迁移期间同时读取。

迁移过程涉及完整字节数组，不能保证大文件迁移时内存不增长。部署版缺少 `home-storage.js`，不能假定本地源码与部署版本一致。

## 3. 执行阶段

### 阶段 A：迁移前盘点

在后台和云电脑分别记录：

- `free -h`、`df -h`、`du -sh` 的结果。
- API、Worker、PostgreSQL、隧道和桌面服务状态。
- `DATA_DIR/artifacts`、`DATA_DIR/homes`、`DATA_DIR/staging`、`DATA_DIR/pi-sessions` 的大小。
- 空闲状态和一次单任务的峰值 RSS、CPU、swap。
- 当前是否存在 running、waiting 或结果未知的 Run。

迁移前不得有未核对的活动副作用；正在运行的任务应完成、取消并核对，或明确保持迁移窗口关闭。

### 阶段 B：准备云电脑侧存储

将来重新评估时需要先确定：

- 私有对象存储 endpoint、bucket、region、prefix。
- 对象存储服务运行账号和数据目录。
- 仅允许后台控制账号访问的 access key。
- 磁盘容量、备份/快照、生命周期和恢复方式。
- 后台到端点的网络路径和 TLS/主机校验。

建议使用独立 prefix，例如 `sydney/`，并将 bucket 设置为私有。对象存储端点不得直接暴露给浏览器、模型或桌面账号。

### 阶段 C：配置后台

在后台的受保护环境文件中配置，值不写入仓库：

```env
OBJECT_STORAGE_BUCKET=sydney-private
OBJECT_STORAGE_ENDPOINT=https://<private-storage-endpoint>
OBJECT_STORAGE_REGION=<region>
OBJECT_STORAGE_ACCESS_KEY_ID=<backend-only-key>
OBJECT_STORAGE_SECRET_ACCESS_KEY=<backend-only-secret>
OBJECT_STORAGE_PREFIX=sydney/
OBJECT_STORAGE_PATH_STYLE=false
```

保留现有 `DATA_DIR` 作为运行时缓存、staging 和回滚副本。`OBJECT_STORAGE_*` 必须同时配置给后台的 API 和 Worker；只配置一侧会造成读写不一致。

迁移前建议显式关闭原始 Pi 会话记录：

```env
PI_SESSION_RECORDING=false
```

该设置只影响之后的新会话，不会自动删除已有 `DATA_DIR/pi-sessions`。

### 阶段 D：试运行和迁移

以下命令依赖实际部署路径、服务名和容器方式，当前未在目标服务器执行。正式执行前先按阶段 A 记录并核对路径。

```bash
pnpm --filter @rakazo/api home-storage migrate --dry-run
pnpm --filter @rakazo/api shared-storage artifacts --dry-run
```

确认对象存储可写、内容加密密钥已配置、没有活动 Run 后：

```bash
pnpm --filter @rakazo/api home-storage migrate
pnpm --filter @rakazo/api shared-storage artifacts
```

迁移过程中：

- 先迁移 home，再迁移 artifact。
- 每批完成后记录 counts，不记录对象 key、密钥或文件原文。
- 失败项保留在 pending，重新执行同一命令，不手工改数据库。
- 保留 `DATA_DIR/homes`、`DATA_DIR/home-revisions` 和本地 artifact 文件。
- 迁移窗口内停止所有 API/Worker 副本，避免旧进程继续写入本地卷。

### 阶段 E：切换验收

重启 API/Worker 后至少验收：

1. 读取旧本地 artifact。
2. 读取新对象 artifact。
3. 新建一个小附件并确认数据库只保存元数据，内容进入对象存储。
4. 云电脑启动后能恢复 Agent home、浏览器配置和工作区。
5. 任务能把附件写入云电脑工作区，并从工作区生成一个小结果。
6. 断开对象存储后，任务返回明确错误，不把缺失文件当成空文件。
7. 重启 API/Worker 后再次读取对象 artifact。
8. 备份数据库、内容密钥和对象存储后，在隔离目录完成一次抽样恢复。

### 阶段 F：清理与资源复测

验收通过后再按保留期清理后台副本。先移动到带日期的回滚目录，观察一个完整使用周期，再删除：

- 后台 `DATA_DIR/artifacts` 中已经全部迁移并抽样读取成功的文件。
- 后台 `DATA_DIR/homes` 和 `DATA_DIR/home-revisions` 中已经有对象存储修订的旧缓存。
- 已确认不再需要的 `pi-sessions`。

清理不能删除数据库、内容密钥、隧道材料或对象存储备份。清理后重新记录后台可用内存、swap、磁盘和任务峰值。

## 4. 回滚

对象存储切换失败时：

1. 停止 API/Worker。
2. 检查数据库指针及迁移期间的新增写入；若存在对象存储指针，继续保留对象存储配置和可访问性。
3. 如需停用对象存储，先完成受控迁回，或恢复时间一致的数据库与文件备份，并验证所有指针可读。
4. 确认本地 artifact 和 home 副本与数据库一致后，再恢复原环境配置并启动服务。
5. 抽样验证旧文件、新写入和 home 恢复；未完成一致性验证前不得停用对象存储。

迁移工具保留本地源文件并使用条件更新，因此中断本身不应要求回滚数据库。对象存储中出现未被数据库引用的对象时，不得按名称猜测删除。

## 5. 当前验收状态

- 已完成：代码和现有迁移工具盘点。
- 已完成：两机资源盘点；后台 SSH 已恢复，Web 进程已迁至云电脑试运行。
- 已完成：后台控制数据、云电脑活动工作区、对象存储文件内容和敏感凭据的划分。
- 未执行：云电脑对象存储服务安装或端点配置。
- 未执行：服务器 dry-run、home/artifact 实际迁移、服务重启、备份恢复和清理。
- 未完成：断线恢复、重启恢复和高负载资源复测。
