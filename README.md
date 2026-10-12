# companion-module-feelworld-l3

> 本文档提供中英双语说明。Chinese and English documentation are both included below.

---

## 目录 / Table of Contents

- [中文文档](#中文文档)
  - [项目简介](#项目简介)
  - [项目结构](#项目结构)
  - [安装与构建](#安装与构建)
  - [设备配置](#设备配置)
  - [通信协议说明](#通信协议说明)
  - [功能列表](#功能列表)
  - [二次开发注意事项](#二次开发注意事项)
  - [快速添加功能指南](#快速添加功能指南)
- [English Documentation](#english-documentation)
  - [Project Overview](#project-overview)
  - [Project Structure](#project-structure)
  - [Installation & Build](#installation--build)
  - [Device Configuration](#device-configuration)
  - [Communication Protocol](#communication-protocol)
  - [Feature List](#feature-list)
  - [Secondary Development Notes](#secondary-development-notes)
  - [Quick Guide: Adding New Features](#quick-guide-adding-new-features)

---

# 中文文档

## 项目简介

本项目是 [Bitfocus Companion](https://bitfocus.io/companion) 的一个控制模块（Module），用于通过 UDP 网络协议远程控制 **Feelworld L3** 视频切换台。

Companion 是一款强大的软件，允许通过流媒体面板（如 Elgato Stream Deck、其他 MIDI/按键设备）控制各类演播室设备。每个受控设备通过独立的「Module」插件实现，本项目即为 Feelworld L3 切换台的控制插件。

**主要功能：**

- UDP 通信连接 Feelworld L3 / L3 Pro
- 预监（PVW）/ 播出（PGM）信号源切换（最多 5 路输入）
- Cut / Auto / FTB 转场及转场类型（MIX / DIP / WIPE）选择
- 推流 STREAM 1–4 开关（开启前自动确认，地址为空时按钮警示）
- 录制开始/停止（开始前自动检查 U 盘，无盘时按钮警示）
- 媒体播放控制（播放/暂停/停止/上一个/下一个）
- 场景预设 1–8 调用，再次点击已激活场景则退出
- PIP（画中画）开关、模板、比例与位置调整
- PTZ 云台控制（上/下/左/右/停止/复位/对焦）
- 色键控制（开/关、绿幕/蓝幕互斥高亮）
- Logo / 背景叠加开关
- 特效模式切换（Mode 1–16）
- 音频控制：监听(PVW)/PGM 静音、音量步进、AFV 1–5 路开关
- 连接建立后自动同步设备状态（PGM/PVW、推流、录制、场景、音频等）
- 丰富的按钮状态反馈（Feedback）与瞬时动作闪烁高亮
- 提供 Companion 变量（当前 PGM/PVW 编号）

---

## 项目结构

```
companion-module-feelworld-l3/
├── src/
│   ├── main.ts          # 模块主入口：初始化、UDP 连接、命令收发核心逻辑
│   ├── actions.ts       # 所有 Action（动作）定义及命令映射
│   ├── feedbacks.ts     # 所有 Feedback（反馈）定义
│   ├── presets.ts       # 预设按钮（Presets）定义（自动由 actions 生成）
│   ├── variables.ts     # Companion 变量定义
│   └── upgrades.ts      # 升级脚本（版本迁移用，当前为空数组）
├── companion/
│   ├── manifest.json    # 模块元数据（ID、名称、版本、配置字段等）
│   └── HELP.md          # Companion UI 内显示的帮助文档
├── protocol_new.md      # 设备 UDP 通信协议文档（新版，按 CMD 功能域划分，中文）
├── protocol.md          # 旧版协议文档（仅作参考，模块已改用新版协议）
├── package.json         # Node.js 项目配置
├── tsconfig.json        # TypeScript 编译配置
└── README.md            # 本文件
```

---

## 安装与构建

### 前置要求

- Node.js 18+
- yarn（推荐）或 npm
- Bitfocus Companion（v3.0+，推荐最新稳定版）

### 安装依赖

```bash
yarn/npm install
```

### 构建

```bash
yarn/npm build
```

编译后的文件输出到 `dist/` 目录，Companion 将加载 `dist/main.js`。

### 开发模式（监听文件变化自动编译）

```bash
yarn/npm dev
```

保存任意源文件后，TypeScript 自动重新编译，Companion 会自动重载模块连接，无需手动重启。

### 在 Companion 中调试

1. 在 Companion Launcher 设置界面，将「Developer modules path」指向本项目的**父目录**（即包含本模块文件夹的目录）。
2. 启动 Companion，在 Connections 页面添加「Feelworld L3」连接。
3. 在 Companion 日志面板中可以看到模块输出的 `debug` / `info` / `error` 日志。

---

## 设备配置

在 Companion 的 Connections 页面，为本模块设置以下参数：

| 字段              | 说明                          | 默认值          |
| ----------------- | ----------------------------- | --------------- |
| Device IP Address | Feelworld L3 切换台的 IP 地址 | `192.168.1.100` |
| Port              | UDP 通信端口                  | `39187`         |

> **注意：** Companion 主机与 L3 切换台必须处于同一局域网。L3 使用 UDP 协议通信，请确保防火墙不阻止 UDP 数据包。

---

## 通信协议说明

本模块使用自定义 UDP 二进制协议与 L3 通信，采用**新版协议**（按 CMD 功能域划分模块），详见 [protocol_new.md](./protocol_new.md)；旧版文档 [protocol.md](./protocol.md) 仅作参考。

> **协议要点：** 新版协议中 CMD 按功能域划分（如 0x10 输入、0x12 媒体、0x20 画中画、0x31 特效、0x53 按键、0x61 录制、0x70 PTZ 等）。协议文档中的命令示例帧可能存在与定义不符的历史遗留，**以各命令的帧定义表为准**。

### 命令格式（发送）

```
(R<ADDR><SN><CMD><DAT1><DAT2><DAT3><DAT4><CHKSUM>)
```

- 所有字段均为 16 进制、2 字符、ASCII 编码，总长度 19 个字符。
- `CHKSUM = (ADDR + SN + CMD + DAT1 + DAT2 + DAT3 + DAT4) & 0xFF`

### 命令格式（接收）

```
(S<ADDR><SN><CMD><DAT1><DAT2><DAT3><DAT4><CHKSUM>)
```

### JSON 扩展命令（CMD = 0xB0 / 0xB1）

用于需要携带结构化数据的场景（如录制控制、键控参数）。格式为：标准头部 + UTF-8 JSON 字符串 + 数据校验和字节。

### 四类命令发送方法

| 方法                                                       | 用途                                            |
| ---------------------------------------------------------- | ----------------------------------------------- |
| `sendCommand(cmd, dat1, dat2, dat3, dat4)`                 | 发送标准二进制帧命令                            |
| `sendKeyPress(keyCode)`                                    | 模拟按键（CMD=0x53，发送按下+松开，间隔 50ms）  |
| `sendAiVoiceKeyPress(functionCode)`                        | 发送 AI 语音模块按键（CMD=0x8A）                |
| `sendJsonCommand(cmd, dat1, dat2, payload)`                | 发送 JSON 扩展命令（CMD=0xB0）                  |
| `toggleStream(index)`                                      | 切换推流 STREAM 1–4（JSON 命令 0xB0 0x60 0x04） |
| `toggleRecord()`                                           | 录制开关（含 U 盘存在性检查）                   |
| `toggleScene(scene)`                                       | 场景调用/退出 toggle                            |
| `toggleKey()` / `toggleLogo()` / `toggleBackgroundPower()` | 抠像/LOGO/背景开关 toggle                       |

### 已实现功能的命令映射（新版协议）

| 功能                                                   | 命令                                                                                                                    |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| 按键类（源切换 / Cut / Auto / FTB / PIP / 转场类型等） | `0x53 0x01` + 键值（DAT3：0x01 按下 / 0x02 松开）                                                                       |
| 媒体播放 / 暂停 / 停止                                 | `0x12 0x00`，DAT2：0x01 播放 / 0x02 暂停 / 0x00 停止                                                                    |
| 上一个 / 下一个媒体                                    | `0x12 0x04` / `0x12 0x02`                                                                                               |
| 推流 STREAM 1–4 开关                                   | JSON `0xB0 0x60 0x04` `{"index":0-3,"ispush":bool}`（开启后以收到 `0xB1 0x58` streamInfo 推送为确认；无地址时设备静默） |
| 录制开始 / 停止                                        | JSON `0xB0 0x61 0x01` `{"isStart":bool}`                                                                                |
| U 盘存在性检查（录制前）                               | `0x61 0x09`（应答 DAT2：0x01 存在 / 0x00 不存在）                                                                       |
| PIP 开关 / 图层 / 模板 / 比例 / 位置                   | `0x20 0x04/0x08/0x06/0x0A/0x00-0x03` 等                                                                                 |
| 特效模式 1–16                                          | `0x31 0x00`，DAT2=0x00–0x0F                                                                                             |
| 场景调用 / 退出 / 读取                                 | `0x30 0x00`（DAT2=1-8）/ `0x30 0x04` / `0x30 0x01`                                                                      |
| 静音 / 音量                                            | `0x41 0x00/0x01/0x02/0x03`（DAT2：0x00 监听(PVW) / 0x01 PGM）                                                           |
| AFV 1–5 路                                             | `0x40 0x01/0x02`（DAT3=通道 0-4）                                                                                       |
| Logo 开 / 关 / 查询                                    | `0x23 0x02`（DAT2 固定 0x00，DAT3=On/Off）/ `0x23 0x03`                                                                 |
| 背景开 / 关 / 选择 / 查询                              | `0x22 0x00` / `0x22 0x02` / `0x22 0x03`                                                                                 |
| 色键开关 / 色度模式 / 色度参数 / 查询                  | `0x24 0x00` / `0x24 0x02 0x01` / JSON `0xB0 0x24 0x04` / `0xB1 0x24 0x05`                                               |
| PTZ 复位 / 聚焦 / 方向                                 | `0x70 0x09` / `0x70 0x06` / `0x70 0x0B`                                                                                 |
| FTB 黑场 / 状态读取                                    | 按键 / `0x38 0x00`（DAT2：0x00 开启 / 0x01 关闭）                                                                       |
| PGM/PVW 状态应答（被动解析）                           | `0x54 0x0A`（DAT2=PGM、DAT3=PVW）                                                                                       |
| 设备状态主动上报（JSON）                               | `0xB1 0x58`（streamInfo / recordInfo / keyInfo / sceneInfo / effectInfo / audioInfo 等）                                |
| AI 语音按键（PIP 步进等）                              | `0x8A 0x01` + 功能码                                                                                                    |

### 设备端已知问题与模块侧兼容处理（实测 L3 Pro 固件）

1. **上报 JSON 不完全合法**：键名可能未加引号（如 `data:`、`dev_name:`）、末尾残留校验字节。模块采用宽松解析（`tryParseLooseJson`），已兼容。
2. **streamInfo 推送帧头异常**：DAT3/DAT4 长度字段与规范不符。模块对 0xB0/0xB1 JSON 帧改为按花括号配对提取数据块，不依赖长度字段。
3. **应答滞后一拍**：写入色度参数、推流开关后，设备立即推送的 `keyInfo.chromaInfo` / `streamInfo.urlInfo` 中状态为写入前旧值。因此：色键绿/蓝高亮使用「设备上报颜色/色度区间 + 本地下发记录」综合判定；推流开启以「收到 streamInfo 推送」为确认依据，不依赖其中 `isPush` 值。
4. **streamInfo.urlInfo 的 id 从 1 开始**（id=1 对应 STREAM1），与数组下标习惯不同，解析时按 `id-1` 映射。
5. **未实现的读取命令可能导致设备静默**：实测发送本固件未实现的 `0xB1 0x60 0x02`（25.3 读取推流列表）后设备可能停止应答（疑似固件 bug，需重启恢复）。模块已避免使用该命令；开发新功能时如遇设备整体静默，先排查是否发送了固件未实现的命令。

---

## 功能列表

### Actions（动作）

| 分类         | Action ID                                                                                              | 说明                                       |
| ------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| **预监切换** | `pvw_source_1` ~ `pvw_source_5`                                                                        | 设置预监（PVW）输入源 1–5                  |
| **播出切换** | `pgm_source_1` ~ `pgm_source_5`                                                                        | 设置播出（PGM）输入源 1–5                  |
| **转场**     | `cut` / `auto` / `ftb`                                                                                 | 切、自动转场、淡出到黑场                   |
| **转场类型** | `transition_mix` / `transition_dip` / `transition_wipe`                                                | 设置转场类型（有状态高亮）                 |
| **推流**     | `stream_toggle_1` ~ `stream_toggle_4`                                                                  | 推流 STREAM 1–4 开关（地址为空时按钮警示） |
| **媒体**     | `media_play` / `media_pause` / `media_stop` / `media_previous` / `media_next`                          | 媒体文件播放控制                           |
| **录制**     | `record_toggle`                                                                                        | 录制开关（无 U 盘时按钮显示 NO DISK 警示） |
| **场景**     | `scene_recall_1` ~ `scene_recall_8`                                                                    | 场景预设调用；再次点击已激活场景则退出     |
| **PIP**      | `pip_toggle` / `pip_template_1~8` / `pip_aspect_*` / `pip_x/y/size_*`                                  | 画中画控制                                 |
| **图层**     | `layer_a` / `layer_b`                                                                                  | 图层 A/B 选择                              |
| **PTZ**      | `ptz_up/down/left/right/stop/reset` / `ptz_focus_auto/manual`                                          | 云台控制                                   |
| **Logo**     | `logo_toggle`                                                                                          | Logo 叠加开关                              |
| **背景**     | `background_toggle` / `background_power_toggle`                                                        | 背景图循环切换 / 背景层开关                |
| **色键**     | `key_toggle` / `key_green` / `key_blue`                                                                | 键控开关 / 绿幕 / 蓝幕（绿蓝互斥高亮）     |
| **特效模式** | `effect_mode_1` ~ `effect_mode_16`                                                                     | 特效模板选择                               |
| **音频**     | `pvw_mute_toggle` / `pgm_mute_toggle` / `pvw_volume_up/down` / `pgm_volume_up/down` / `afv_toggle_1~5` | 静音 / 音量步进 / AFV                      |
| **其他**     | `zoom_tele` / `zoom_wide` / `menu` / `back`                                                            | 缩放/菜单/返回                             |

### Feedbacks（反馈）

| Feedback ID                                                                  | 说明                                                  | 默认样式           |
| ---------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------ |
| `pgm_source` / `pvw_source`                                                  | 指定来源处于 PGM / PVW 时高亮（可选输入源）           | 红/绿背景          |
| `pgm_pvw_same`                                                               | PGM 和 PVW 来源相同时高亮（警告）                     | 黄色背景           |
| `record_active`                                                              | 录制进行中高亮                                        | 绿色背景           |
| `record_no_disk`                                                             | 开始录制因无 U 盘被拦截时短暂警示                     | 黄色 NO DISK       |
| `stream_1_active` ~ `stream_4_active`                                        | 对应推流路开启时高亮                                  | 绿色背景           |
| `stream_no_addr`                                                             | 开启推流因地址为空未获确认时短暂警示（可选路数）      | 黄色 ADDRESS EMPTY |
| `scene_active`                                                               | 指定场景预设当前激活时高亮                            | 绿色背景           |
| `pip_active` / `key_active` / `logo_active` / `background_active`            | PIP / 抠像 / LOGO / 背景层开启时高亮                  | 绿色背景           |
| `key_green_active` / `key_blue_active`                                       | 色键为绿幕 / 蓝幕时高亮（互斥）                       | 绿色背景           |
| `pvw_mute_active` / `pgm_mute_active`                                        | 对应输出静音时高亮                                    | 绿色背景           |
| `afv_1_active` ~ `afv_5_active`                                              | 对应 AFV 路开启时高亮                                 | 绿色背景           |
| `layer_a_active` / `layer_b_active`                                          | 图层 A / B 选中时高亮                                 | 绿色背景           |
| `ftb_active`                                                                 | FTB 黑场激活时高亮                                    | 绿色背景           |
| `transition_mix_active` / `transition_dip_active` / `transition_wipe_active` | 对应转场类型选中时高亮                                | 绿色背景           |
| `flash_active`                                                               | 瞬时动作（CUT、媒体控制等）执行时闪烁高亮（可选动作） | 绿色背景           |

> 预设按钮会自动携带对应的反馈；旧按钮（反馈变更前拖出的）需要重新拖预设才能拿到新反馈。

### Variables（变量）

| 变量 ID       | 说明                           |
| ------------- | ------------------------------ |
| `current_pgm` | 当前播出（PGM）来源编号（1–5） |
| `current_pvw` | 当前预监（PVW）来源编号（1–5） |

---

## 二次开发注意事项

### 1. 先理解现有架构

- **`main.ts`** 是核心，负责 UDP Socket 生命周期、命令构建/发送、响应解析、状态维护。不要随意修改 `handleResponse()` 的解析逻辑，这里依赖设备返回的特定帧格式。
- **`actions.ts`** 中的 `ACTION_SPECS` 数组驱动整个 Action 注册和 Preset 生成逻辑，保持数据驱动风格。
- **`presets.ts`** 完全依赖 `ACTION_SPECS`，因此添加 Action 后 Preset 会自动生成，无需单独维护。

### 2. 协议字节序与校验和

- 所有命令帧的字段必须转成 2 位 16 进制 ASCII 字符串，使用 `value.toString(16).padStart(2, '0')`。
- CHKSUM 必须正确，否则设备会**静默忽略**命令，不返回任何错误提示。
- JSON 扩展帧（0xB0）末尾的校验和是 JSON 字节的累加和，与主帧 CHKSUM 计算方式不同，注意区分。

### 3. UDP 无连接特性

- UDP 是无连接协议，`socket.bind()` 成功后即设置为 `InstanceStatus.Ok`，但这**不代表设备在线**。
- 命令发送给离线设备会静默失败（只在日志中记录）。
- 如需确认设备在线，可参考 `protocol_new.md` 中的 UDP 广播发现流程。

### 4. 状态回报与 Feedback 更新

- 模块在连接建立后通过 `syncAllStates()` 发送一轮读取命令校准各功能状态；运行期被动解析设备推送：
  - 定长帧应答在 `handleFixedFrame()` 中解析（PGM/PVW 状态 0x54 0x0A、背景 0x22 0x03、抠像 0x24 0x03、场景 0x30 0x01、特效 0x31 0x01、FTB 0x38、U 盘 0x61 0x09 等）。
  - JSON 状态上报（0xB1 0x58）在 `applyJsonReport()` 中解析（streamInfo / recordInfo / keyInfo / sceneInfo / effectInfo / audioInfo 等）。
- 模块不主动轮询，运行期依赖设备推送；写入类操作部分采用「发送后等待应答确认」模式（推流、录制 U 盘检查、背景查询）。
- 若需追踪更多设备状态，在对应解析函数中增加分支，更新实例状态变量后调用 `this.checkFeedbacks()`（必要时 `this.setVariableValues()`）。
- 注意实测固件的兼容性问题（JSON 非标准、应答滞后一拍、urlInfo id 1 起始等），详见「设备端已知问题与模块侧兼容处理」。

### 5. TypeScript 类型安全

- 当前 Action 均使用 `NO_OPTIONS`（空数组），即无用户可配参数。若需为 Action 添加参数，需同时更新 `options` 数组和 `callback` 中的 `action.options` 取值逻辑。
- 参考 `feedbacks.ts` 中 `SOURCE_OPTIONS` 的实现（下拉框参数示例）。

### 6. manifest.json 与 package.json 版本同步

- 每次发布新版本，`companion/manifest.json` 的 `version` 与 `package.json` 的 `version` 必须一致。
- `manifest.json` 中的 `id` 字段是模块唯一标识，一旦发布**不可更改**，否则现有用户配置将丢失。

### 7. 调试建议

- 使用 `this.log('debug', ...)` 记录收发数据，Companion Log 面板可实时查看。
- 可用 Wireshark 抓取 UDP 数据包，与 `protocol_new.md` 对照验证命令格式。
- 开发模式下（`yarn dev`），保存文件后 Companion 自动重载模块，无需重启 Companion。

---

## 快速添加功能指南

### 场景一：添加简单 Action（单条命令，无参数）

**示例：** 添加「设置切换时间为 3 秒」，命令为 `CMD=0x31, DAT1=0x04, DAT2=0x03`（新版协议 13.5 切换时间设置）。

**第 1 步：** 打开 `src/actions.ts`，在 `ACTION_SPECS` 数组末尾（`]` 之前）添加一行：

```typescript
commandAction('transition_duration_3s', 'Transition Duration 3s', 'Set transition duration to 3 seconds', 0x31, 0x04, 0x03),
```

**第 2 步（可选）：** 在 `src/presets.ts` 的 `CATEGORY_BY_ACTION` 中添加分类：

```typescript
transition_duration_3s: 'Transition',
```

**第 3 步：** 重新构建：

```bash
yarn build
```

完成！Companion 自动加载新 Action，无需其他修改。

---

### 场景二：添加带用户参数的 Action

**示例：** 「设置 PVW 到指定输入」，用户可在 Companion 中选择输入编号（1–5）。

在 `src/actions.ts` 的 `GetActions()` 函数中添加：

```typescript
actions['pvw_source_dynamic'] = {
	name: 'Set PVW Source',
	description: 'Set Preview to a user-selected input',
	options: [
		{
			type: 'dropdown',
			id: 'source',
			label: 'Source',
			default: '1',
			choices: [
				{ id: '1', label: 'Input 1' },
				{ id: '2', label: 'Input 2' },
				{ id: '3', label: 'Input 3' },
				{ id: '4', label: 'Input 4' },
				{ id: '5', label: 'Input 5 (Media)' },
			],
		},
	],
	callback: async (action) => {
		const sourceNum = parseInt(action.options.source as string)
		const keyMap: Record<number, number> = {
			1: KEY_CODES.KEY_PVW_SOURCE_1,
			2: KEY_CODES.KEY_PVW_SOURCE_2,
			3: KEY_CODES.KEY_PVW_SOURCE_3,
			4: KEY_CODES.KEY_PVW_SOURCE_4,
			5: KEY_CODES.KEY_PVW_SOURCE_5,
		}
		const key = keyMap[sourceNum]
		if (key !== undefined) await instance.sendKeyPress(key)
	},
}
```

---

### 场景三：添加新 Feedback

**示例：** 「录制中」Feedback——当录制激活时按钮高亮。

**第 1 步：** 在 `src/main.ts` 中添加状态变量和 getter：

```typescript
private isRecording: boolean = false

isRecordingActive(): boolean { return this.isRecording }

// 在 handleResponse() 中增加解析分支（需根据实际协议填写 CMD）：
// if (cmd === 0xXX) {
//     this.isRecording = dat1 === 0x01
//     this.checkFeedbacks('recording_active')
// }
```

**第 2 步：** 在 `src/feedbacks.ts` 的 `GetFeedbacks()` 中添加：

```typescript
feedbacks['recording_active'] = {
	type: 'boolean',
	name: 'Recording Active',
	description: 'Highlight when recording is active',
	defaultStyle: { bgcolor: 0xff0000, color: 0xffffff },
	options: [],
	callback: () => instance.isRecordingActive(),
}
```

---

### 场景四：添加新 Variable

**第 1 步：** 在 `src/variables.ts` 添加声明：

```typescript
{ variableId: 'recording_state', name: 'Recording State' },
```

**第 2 步：** 在 `src/main.ts` 的 `updateVariableValues()` 中赋值：

```typescript
this.setVariableValues({
	current_pgm: this.currentPgm,
	current_pvw: this.currentPvw,
	recording_state: this.isRecording ? 'Recording' : 'Stopped',
})
```

---

### 场景五：添加 JSON 扩展命令 Action

固定 payload（示例：设置画中画缩放参数，新版协议 6.1，CMD=0xB0 DAT1=0x20 DAT2=0x00）：

```typescript
jsonAction('pip_set_scale', 'PIP Scale', 'Set PIP scale parameters', 0xb0, 0x20, 0x00, {
    layer: 1,
    posX: 200,
    posY: 51,
    sizeX: 200,
    sizeY: 160,
}),
```

动态 payload（用户输入数值）：

```typescript
actions['pip_set_scale_dynamic'] = {
	name: 'PIP Set Scale',
	description: 'Set PIP scale to custom values',
	options: [
		{ type: 'number', id: 'posX', label: 'Pos X', default: 0, min: 0, max: 3840 },
		{ type: 'number', id: 'posY', label: 'Pos Y', default: 0, min: 0, max: 2160 },
	],
	callback: async (action) => {
		const posX = action.options.posX as number
		const posY = action.options.posY as number
		await instance.sendJsonCommand(0xb0, 0x20, 0x00, {
			layer: 1,
			posX,
			posY,
			sizeX: 200,
			sizeY: 160,
		})
	},
}
```

---

# English Documentation

## Project Overview

This is a [Bitfocus Companion](https://bitfocus.io/companion) module for controlling the **Feelworld L3** video switcher over UDP.

Bitfocus Companion is a software platform that lets you control broadcast/production equipment through stream decks and button panels. Each device is controlled via a dedicated "module" plugin. This project implements the module for the Feelworld L3 video switcher.

**Key Features:**

- UDP communication with the Feelworld L3 / L3 Pro
- Preview (PVW) / Program (PGM) source switching (up to 5 inputs)
- Cut / Auto / FTB transitions and transition type selection (MIX / DIP / WIPE)
- Streaming toggles for STREAM 1–4 (auto-confirmation on start; button warning when the stream address is empty)
- Recording start/stop (USB disk check before start; NO DISK button warning)
- Media playback control (play/pause/stop/previous/next)
- Scene presets 1–8; tapping the active scene again exits it
- PIP (Picture-in-Picture): toggle, templates, aspect, position and size adjustment
- PTZ camera control (pan/tilt/stop/reset/focus)
- Chroma key (on/off, green/blue with mutually exclusive highlighting)
- Logo / background overlay toggles
- Effect mode selection (Modes 1–16)
- Audio control: monitor (PVW)/PGM mute, volume stepping, AFV 1–5
- Automatic device state sync on connection (PGM/PVW, streaming, recording, scenes, audio, etc.)
- Rich button state feedbacks and instant-action flash highlighting
- Companion variables for current PGM/PVW source numbers

---

## Project Structure

```
companion-module-feelworld-l3/
├── src/
│   ├── main.ts          # Main entry: init, UDP socket, send/receive logic
│   ├── actions.ts       # All Action definitions and command mappings
│   ├── feedbacks.ts     # All Feedback definitions
│   ├── presets.ts       # Preset button definitions (auto-generated from actions)
│   ├── variables.ts     # Companion variable definitions
│   └── upgrades.ts      # Upgrade scripts (version migration; currently empty)
├── companion/
│   ├── manifest.json    # Module metadata (ID, name, version, config fields)
│   └── HELP.md          # Help text shown inside Companion UI
├── protocol_new.md      # UDP protocol documentation (new version, organized by CMD domains, Chinese)
├── protocol.md          # Legacy protocol documentation (reference only; the module now uses the new protocol)
├── package.json         # Node.js project configuration
├── tsconfig.json        # TypeScript compiler configuration
└── README.md            # This file
```

---

## Installation & Build

### Prerequisites

- Node.js 18+
- yarn (recommended) or npm
- Bitfocus Companion (v3.0+, latest stable recommended)

### Install Dependencies

```bash
yarn install
```

### Build

```bash
yarn build
```

Compiled output goes to `dist/`. Companion loads `dist/main.js`.

### Development Mode (watch & auto-recompile)

```bash
yarn dev
```

TypeScript recompiles on every file save. Companion automatically reloads the module — no manual restart needed.

### Loading in Companion for Development

1. In Companion Launcher settings, set **"Developer modules path"** to the **parent folder** of this module directory.
2. In Companion, go to Connections and add a "Feelworld L3" connection.
3. View `debug`/`info`/`error` logs in the Companion Log panel.

---

## Device Configuration

Configure the following in Companion's Connection settings:

| Field             | Description                    | Default         |
| ----------------- | ------------------------------ | --------------- |
| Device IP Address | IP address of the Feelworld L3 | `192.168.1.100` |
| Port              | UDP communication port         | `39187`         |

> **Note:** The Companion host and L3 must be on the same LAN. Ensure your firewall allows UDP on the configured port.

---

## Communication Protocol

The module uses a custom UDP binary protocol — the **new version** organized by CMD functional domains. Full details in [protocol_new.md](./protocol_new.md); the legacy [protocol.md](./protocol.md) is kept for reference only.

> **Note:** In the new protocol, CMDs are grouped by functional domain (e.g., 0x10 input, 0x12 media, 0x20 PIP, 0x31 effects, 0x53 keys, 0x61 recording, 0x70 PTZ). Example frames in the protocol document may not match their definitions due to historical leftovers — **always follow the frame definition tables**.

### Send Frame Format

```
(R<ADDR><SN><CMD><DAT1><DAT2><DAT3><DAT4><CHKSUM>)
```

All fields are 2-char hex ASCII. Total length: 19 characters.  
`CHKSUM = (ADDR + SN + CMD + DAT1 + DAT2 + DAT3 + DAT4) & 0xFF`

### Receive Frame Format

```
(S<ADDR><SN><CMD><DAT1><DAT2><DAT3><DAT4><CHKSUM>)
```

### JSON Extended Commands (CMD = 0xB0 / 0xB1)

Used for structured payloads (e.g., recording control, chroma key params).  
Format: standard header + UTF-8 JSON string + data checksum byte.

### Command Send Methods

| Method                                                     | Purpose                                                        |
| ---------------------------------------------------------- | -------------------------------------------------------------- |
| `sendCommand(cmd, dat1, dat2, dat3, dat4)`                 | Send a standard binary frame                                   |
| `sendKeyPress(keyCode)`                                    | Simulate key press (CMD=0x53, press + release with 50ms delay) |
| `sendAiVoiceKeyPress(functionCode)`                        | Send an AI voice module key (CMD=0x8A)                         |
| `sendJsonCommand(cmd, dat1, dat2, payload)`                | Send a JSON extended command (CMD=0xB0)                        |
| `toggleStream(index)`                                      | Toggle streaming STREAM 1–4 (JSON command 0xB0 0x60 0x04)      |
| `toggleRecord()`                                           | Recording toggle (with USB disk check)                         |
| `toggleScene(scene)`                                       | Scene recall / exit toggle                                     |
| `toggleKey()` / `toggleLogo()` / `toggleBackgroundPower()` | Key / logo / background toggles                                |

### Command Mapping of Implemented Features (New Protocol)

| Feature                                                                               | Command                                                                                                                                      |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Key-based actions (source switching / Cut / Auto / FTB / PIP / transition type, etc.) | `0x53 0x01` + key code (DAT3: 0x01 press / 0x02 release)                                                                                     |
| Media play / pause / stop                                                             | `0x12 0x00`, DAT2: 0x01 play / 0x02 pause / 0x00 stop                                                                                        |
| Previous / next media                                                                 | `0x12 0x04` / `0x12 0x02`                                                                                                                    |
| Streaming STREAM 1–4 toggles                                                          | JSON `0xB0 0x60 0x04` `{"index":0-3,"ispush":bool}` (confirmed by a following `0xB1 0x58` streamInfo push; silent when the address is empty) |
| Record start / stop                                                                   | JSON `0xB0 0x61 0x01` `{"isStart":bool}`                                                                                                     |
| USB disk presence check (before recording)                                            | `0x61 0x09` (reply DAT2: 0x01 present / 0x00 absent)                                                                                         |
| PIP toggle / layers / templates / aspect / position                                   | `0x20 0x04/0x08/0x06/0x0A/0x00-0x03` etc.                                                                                                    |
| Effect modes 1–16                                                                     | `0x31 0x00`, DAT2=0x00–0x0F                                                                                                                  |
| Scene recall / exit / read                                                            | `0x30 0x00` (DAT2=1-8) / `0x30 0x04` / `0x30 0x01`                                                                                           |
| Mute / volume                                                                         | `0x41 0x00/0x01/0x02/0x03` (DAT2: 0x00 monitor PVW / 0x01 PGM)                                                                               |
| AFV 1–5                                                                               | `0x40 0x01/0x02` (DAT3=channel 0-4)                                                                                                          |
| Logo on / off / query                                                                 | `0x23 0x02` (DAT2 fixed 0x00, DAT3=On/Off) / `0x23 0x03`                                                                                     |
| Background on / off / select / query                                                  | `0x22 0x00` / `0x22 0x02` / `0x22 0x03`                                                                                                      |
| Chroma key on-off / mode / params / query                                             | `0x24 0x00` / `0x24 0x02 0x01` / JSON `0xB0 0x24 0x04` / `0xB1 0x24 0x05`                                                                    |
| PTZ reset / focus / direction                                                         | `0x70 0x09` / `0x70 0x06` / `0x70 0x0B`                                                                                                      |
| FTB / status read                                                                     | key press / `0x38 0x00` (DAT2: 0x00 on / 0x01 off)                                                                                           |
| PGM/PVW status reply (passive parsing)                                                | `0x54 0x0A` (DAT2=PGM, DAT3=PVW)                                                                                                             |
| Device state push (JSON)                                                              | `0xB1 0x58` (streamInfo / recordInfo / keyInfo / sceneInfo / effectInfo / audioInfo, etc.)                                                   |
| AI voice keys (PIP adjust steps, etc.)                                                | `0x8A 0x01` + function code                                                                                                                  |

### Known Device Issues & Module Compatibility Workarounds (verified on L3 Pro firmware)

1. **Non-strict report JSON**: keys may be unquoted (e.g. `data:`, `dev_name:`) with a trailing checksum byte. The module uses a tolerant parser (`tryParseLooseJson`).
2. **streamInfo push header anomaly**: the DAT3/DAT4 length field deviates from the spec. The module extracts 0xB0/0xB1 JSON payloads by brace matching instead of trusting the length field.
3. **One-beat-late acknowledgements**: after writing chroma params or a stream toggle, the immediately pushed `keyInfo.chromaInfo` / `streamInfo.urlInfo` still carry the pre-write values. Therefore: chroma green/blue highlighting combines reported color/range with the locally last-sent choice; stream start confirmation is based on receiving a streamInfo push, not on its `isPush` value.
4. **streamInfo.urlInfo `id` starts from 1** (id=1 → STREAM1), unlike zero-based array conventions; parsed as `id-1`.
5. **Unimplemented read commands may silence the device**: sending `0xB1 0x60 0x02` (25.3 read stream list), which this firmware does not implement, can make the device stop responding entirely (suspected firmware bug; requires a power cycle). The module avoids this command — when developing new features, suspect unimplemented commands if the device goes fully silent.

---

## Feature List

### Actions

| Category            | Action IDs                                                                                             | Description                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| **Preview**         | `pvw_source_1` – `pvw_source_5`                                                                        | Set PVW to Input 1–5                                       |
| **Program**         | `pgm_source_1` – `pgm_source_5`                                                                        | Set PGM to Input 1–5                                       |
| **Transition**      | `cut` / `auto` / `ftb`                                                                                 | Cut, Auto, Fade to Black                                   |
| **Transition Type** | `transition_mix` / `transition_dip` / `transition_wipe`                                                | Set transition type (state feedback)                       |
| **Streaming**       | `stream_toggle_1` – `stream_toggle_4`                                                                  | Toggle STREAM 1–4 (warning when address empty)             |
| **Media**           | `media_play` / `media_pause` / `media_stop` / `media_previous` / `media_next`                          | Media playback                                             |
| **Recording**       | `record_toggle`                                                                                        | Recording toggle (NO DISK warning without USB disk)        |
| **Scenes**          | `scene_recall_1` – `scene_recall_8`                                                                    | Recall scene preset; tap again to exit                     |
| **PIP**             | `pip_toggle` / `pip_template_1–8` / `pip_aspect_*` / `pip_x/y/size_*`                                  | PIP control                                                |
| **Layers**          | `layer_a` / `layer_b`                                                                                  | Layer A/B selection                                        |
| **PTZ**             | `ptz_up/down/left/right/stop/reset` / `ptz_focus_auto/manual`                                          | PTZ camera                                                 |
| **Logo**            | `logo_toggle`                                                                                          | Logo overlay toggle                                        |
| **Background**      | `background_toggle` / `background_power_toggle`                                                        | Cycle background image / background layer toggle           |
| **Chroma Key**      | `key_toggle` / `key_green` / `key_blue`                                                                | Keyer toggle / green / blue (mutually exclusive highlight) |
| **Effect Modes**    | `effect_mode_1` – `effect_mode_16`                                                                     | Effect template selection                                  |
| **Audio**           | `pvw_mute_toggle` / `pgm_mute_toggle` / `pvw_volume_up/down` / `pgm_volume_up/down` / `afv_toggle_1~5` | Mute / volume stepping / AFV                               |
| **Misc**            | `zoom_tele` / `zoom_wide` / `menu` / `back`                                                            | Zoom/menu/back                                             |

### Feedbacks

| Feedback ID                                                                  | Description                                                           | Default Style          |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------- |
| `pgm_source` / `pvw_source`                                                  | Highlight when a specific source is on PGM / PVW (selectable)         | Red / green background |
| `pgm_pvw_same`                                                               | Highlight when PGM and PVW source match (warning)                     | Yellow background      |
| `record_active`                                                              | Highlight while recording                                             | Green background       |
| `record_no_disk`                                                             | Brief warning when a record start was blocked (no USB disk)           | Yellow NO DISK         |
| `stream_1_active` – `stream_4_active`                                        | Highlight while the corresponding stream is pushing                   | Green background       |
| `stream_no_addr`                                                             | Brief warning when a stream start got no confirmation (address empty) | Yellow ADDRESS EMPTY   |
| `scene_active`                                                               | Highlight when the selected scene preset is active                    | Green background       |
| `pip_active` / `key_active` / `logo_active` / `background_active`            | Highlight when PIP / keyer / logo / background layer is on            | Green background       |
| `key_green_active` / `key_blue_active`                                       | Highlight when chroma key uses green / blue (mutually exclusive)      | Green background       |
| `pvw_mute_active` / `pgm_mute_active`                                        | Highlight when the corresponding output is muted                      | Green background       |
| `afv_1_active` – `afv_5_active`                                              | Highlight when the corresponding AFV is enabled                       | Green background       |
| `layer_a_active` / `layer_b_active`                                          | Highlight when layer A / B is selected                                | Green background       |
| `ftb_active`                                                                 | Highlight when fade to black is active                                | Green background       |
| `transition_mix_active` / `transition_dip_active` / `transition_wipe_active` | Highlight when the transition type is selected                        | Green background       |
| `flash_active`                                                               | Flash highlight when an instant action runs (selectable)              | Green background       |

> Presets carry their feedbacks automatically; buttons dragged before a feedback change must be re-dragged to pick up new feedbacks.

### Variables

| Variable ID   | Description                     |
| ------------- | ------------------------------- |
| `current_pgm` | Current PGM source number (1–5) |
| `current_pvw` | Current PVW source number (1–5) |

---

## Secondary Development Notes

### 1. Understand the Architecture First

- **`main.ts`** is the core — UDP socket lifecycle, frame construction, response parsing, state management. Be careful modifying `handleResponse()`; it depends on the exact device frame format.
- **`actions.ts`** uses a data-driven `ACTION_SPECS` array that drives both action registration and preset generation. Keep this pattern.
- **`presets.ts`** auto-generates all presets from `ACTION_SPECS` — no manual preset work needed when adding new actions.

### 2. Protocol Byte Order & Checksum

- All frame fields must be 2-char hex ASCII: `value.toString(16).padStart(2, '0')`.
- An incorrect CHKSUM causes the device to **silently ignore** the command — no error response is returned.
- The JSON extended frame (0xB0) has a separate data checksum (sum of JSON bytes) appended **after** the JSON payload. This is different from the header CHKSUM.

### 3. UDP Is Connectionless

- `InstanceStatus.Ok` is set when `socket.bind()` succeeds — this means the local port is ready, **not** that the device is reachable.
- Commands sent to an offline device fail silently (only logged).
- For device discovery, see the UDP broadcast flow in `protocol_new.md`.

### 4. State Feedback & Variable Updates

- On connection, `syncAllStates()` sends a round of read commands to sync all feature states; during operation the module parses device pushes:
  - Fixed-frame replies are parsed in `handleFixedFrame()` (PGM/PVW 0x54 0x0A, background 0x22 0x03, keyer 0x24 0x03, scene 0x30 0x01, effects 0x31 0x01, FTB 0x38, USB disk 0x61 0x09, etc.).
  - JSON state pushes (0xB1 0x58) are parsed in `applyJsonReport()` (streamInfo / recordInfo / keyInfo / sceneInfo / effectInfo / audioInfo, etc.).
- The module does not poll at runtime; some write operations use a send-then-wait-for-confirmation pattern (streaming, USB disk check, background query).
- To track more device states, add a branch in the corresponding parser, update instance state, then call `this.checkFeedbacks()` (and `this.setVariableValues()` when needed).
- Mind the verified firmware quirks (non-strict JSON, late acknowledgements, 1-based urlInfo ids) — see "Known Device Issues & Module Compatibility Workarounds".

### 5. TypeScript Type Safety

- Current actions use `NO_OPTIONS` (no user-configurable parameters). To add parameters, update both the `options` array and the `callback` to read from `action.options`.
- See `feedbacks.ts` (`SOURCE_OPTIONS`) for a dropdown parameter example.

### 6. Version Synchronization

- On every release, `companion/manifest.json` → `version` and `package.json` → `version` must match.
- The `id` field in `manifest.json` is the permanent module identifier. **Never change it** after publishing — it will break all existing user configurations.

### 7. Debugging Tips

- Use `this.log('debug', ...)` to log sent/received data — visible in Companion's Log panel in real time.
- Use Wireshark to capture UDP packets and validate against `protocol_new.md`.
- In dev mode (`yarn dev`), file saves trigger auto-recompile and Companion auto-reloads the module.

---

## Quick Guide: Adding New Features

### Case 1: Add a Simple Action (single command, no user input)

**Example:** "Set transition duration to 3 seconds" — CMD=0x31, DAT1=0x04, DAT2=0x03 (new protocol 13.5, transition duration).

**Step 1** — Open `src/actions.ts`, add to `ACTION_SPECS` (before the closing `]`):

```typescript
commandAction('transition_duration_3s', 'Transition Duration 3s', 'Set transition duration to 3 seconds', 0x31, 0x04, 0x03),
```

**Step 2 (optional)** — Add a preset category in `src/presets.ts` → `CATEGORY_BY_ACTION`:

```typescript
transition_duration_3s: 'Transition',
```

**Step 3** — Rebuild:

```bash
yarn build
```

Done. Companion exposes the new action automatically.

---

### Case 2: Add an Action with User Parameters

**Example:** A single "Set PVW Source" action where the user picks the input.

In `src/actions.ts`, inside `GetActions()`, add:

```typescript
actions['pvw_source_dynamic'] = {
	name: 'Set PVW Source',
	description: 'Set Preview to a user-selected input',
	options: [
		{
			type: 'dropdown',
			id: 'source',
			label: 'Source',
			default: '1',
			choices: [
				{ id: '1', label: 'Input 1' },
				{ id: '2', label: 'Input 2' },
				{ id: '3', label: 'Input 3' },
				{ id: '4', label: 'Input 4' },
				{ id: '5', label: 'Input 5 (Media)' },
			],
		},
	],
	callback: async (action) => {
		const sourceNum = parseInt(action.options.source as string)
		const keyMap: Record<number, number> = {
			1: KEY_CODES.KEY_PVW_SOURCE_1,
			2: KEY_CODES.KEY_PVW_SOURCE_2,
			3: KEY_CODES.KEY_PVW_SOURCE_3,
			4: KEY_CODES.KEY_PVW_SOURCE_4,
			5: KEY_CODES.KEY_PVW_SOURCE_5,
		}
		const key = keyMap[sourceNum]
		if (key !== undefined) await instance.sendKeyPress(key)
	},
}
```

---

### Case 3: Add a New Feedback

**Example:** "Recording Active" feedback.

**Step 1** — Track state in `src/main.ts`:

```typescript
private isRecording: boolean = false

isRecordingActive(): boolean { return this.isRecording }

// In handleResponse(), add the relevant CMD branch:
// if (cmd === 0xXX) {
//     this.isRecording = dat1 === 0x01
//     this.checkFeedbacks('recording_active')
// }
```

**Step 2** — Define in `src/feedbacks.ts`:

```typescript
feedbacks['recording_active'] = {
	type: 'boolean',
	name: 'Recording Active',
	description: 'Highlight when recording is active',
	defaultStyle: { bgcolor: 0xff0000, color: 0xffffff },
	options: [],
	callback: () => instance.isRecordingActive(),
}
```

---

### Case 4: Add a New Variable

**Step 1** — Declare in `src/variables.ts`:

```typescript
{ variableId: 'recording_state', name: 'Recording State' },
```

**Step 2** — Set value in `src/main.ts` → `updateVariableValues()`:

```typescript
this.setVariableValues({
	current_pgm: this.currentPgm,
	current_pvw: this.currentPvw,
	recording_state: this.isRecording ? 'Recording' : 'Stopped',
})
```

---

### Case 5: Add a JSON Extended Command Action

Fixed payload (example: set PIP scale parameters, new protocol 6.1, CMD=0xB0 DAT1=0x20 DAT2=0x00):

```typescript
jsonAction('pip_set_scale', 'PIP Scale', 'Set PIP scale parameters', 0xb0, 0x20, 0x00, {
    layer: 1,
    posX: 200,
    posY: 51,
    sizeX: 200,
    sizeY: 160,
}),
```

Dynamic payload (user-defined values), in `GetActions()`:

```typescript
actions['pip_set_scale_dynamic'] = {
	name: 'PIP Set Scale',
	description: 'Set PIP scale to custom values',
	options: [
		{ type: 'number', id: 'posX', label: 'Pos X', default: 0, min: 0, max: 3840 },
		{ type: 'number', id: 'posY', label: 'Pos Y', default: 0, min: 0, max: 2160 },
	],
	callback: async (action) => {
		const posX = action.options.posX as number
		const posY = action.options.posY as number
		await instance.sendJsonCommand(0xb0, 0x20, 0x00, {
			layer: 1,
			posX,
			posY,
			sizeX: 200,
			sizeY: 160,
		})
	},
}
```

---

## Resources

- [Bitfocus Companion](https://bitfocus.io/companion)
- [Module Development Guide](https://companion.free/for-developers/module-development/)
- [companion-module-base API Docs](https://bitfocus.github.io/companion-module-base/)
- [TypeScript Module Template](https://github.com/bitfocus/companion-module-template-ts)
- [Device Protocol Documentation (new version)](./protocol_new.md)
- [Device Protocol Documentation (legacy)](./protocol.md)

## License

MIT
