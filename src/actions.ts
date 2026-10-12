import type {
	CompanionActionDefinitions,
	CompanionOptionValues,
	SomeCompanionActionInputField,
} from '@companion-module/base'
import type ModuleInstance from './main.js'

export type ActionsSchema = Record<string, { options: CompanionOptionValues }>

const KEY_CODES = {
	KEY_RECORD: 0x01,
	KEY_PLAY: 0x02,
	KEY_PAUSE: 0x03,
	KEY_LAST_SONG: 0x04,
	KEY_STOP: 0x05,
	KEY_NEXT_SONG: 0x06,
	KEY_ON_AIR_1: 0x07,
	KEY_ON_AIR_2: 0x08,
	KEY_PTZ: 0x09,
	KEY_BKGD: 0x1d,
	KEY_KEY: 0x1e,
	KEY_PIP: 0x1f,
	KEY_LAYER_A: 0x20,
	KEY_LAYER_B: 0x21,
	KEY_MIX: 0x22,
	KEY_DIP: 0x23,
	KEY_WIRE: 0x24,
	KEY_PGM_SOURCE_1: 0x3e,
	KEY_PGM_SOURCE_2: 0x3f,
	KEY_PGM_SOURCE_3: 0x40,
	KEY_PGM_SOURCE_4: 0x41,
	KEY_PGM_SOURCE_5: 0x42,
	KEY_LOGO: 0x43,
	KEY_PVW_SOURCE_1: 0x44,
	KEY_PVW_SOURCE_2: 0x45,
	KEY_PVW_SOURCE_3: 0x46,
	KEY_PVW_SOURCE_4: 0x47,
	KEY_PVW_SOURCE_5: 0x48,
	KEY_PAD_AUTO: 0x4a,
	KEY_PAD_CUT: 0x4b,
	KEY_PAD_FTB: 0x4c,
	KEY_PAD_MENU: 0x4d,
	KEY_PAD_BACK: 0x4e,
	KEY_STOP_MEDIA: 0x53,
	KEY_ZOOM_TELE: 0x56,
	KEY_ZOOM_WIDE: 0x57,
}

const NO_OPTIONS: SomeCompanionActionInputField[] = []

type ActionSpec = {
	id: string
	name: string
	description: string
	run: (instance: ModuleInstance) => Promise<void>
}

const keyAction = (id: string, name: string, description: string, keyCode: number): ActionSpec => ({
	id,
	name,
	description,
	run: (instance) => instance.sendKeyPress(keyCode),
})

const commandAction = (
	id: string,
	name: string,
	description: string,
	cmd: number,
	dat1: number,
	dat2: number,
	dat3 = 0x00,
	dat4 = 0x00,
): ActionSpec => ({
	id,
	name,
	description,
	run: (instance) => instance.sendCommand(cmd, dat1, dat2, dat3, dat4),
})

const customAction = (
	id: string,
	name: string,
	description: string,
	run: (instance: ModuleInstance) => Promise<void>,
): ActionSpec => ({
	id,
	name,
	description,
	run,
})

const aiVoiceAction = (id: string, name: string, description: string, functionCode: number): ActionSpec => ({
	id,
	name,
	description,
	run: (instance) => instance.sendAiVoiceKeyPress(functionCode),
})

/**
 * 瞬时动作清单（执行后触发闪烁高亮，无持久状态）。
 * 有状态高亮的动作（PGM/PVW 源、各开关、场景、图层、转场类型、FTB、抠绿/抠蓝）不在此列。
 */
export const FLASH_ACTIONS = new Set<string>([
	'menu',
	'back',
	'cut',
	'auto',
	'zoom_tele',
	'zoom_wide',
	'media_play',
	'media_pause',
	'media_stop',
	'media_previous',
	'media_next',
	'pvw_volume_up',
	'pvw_volume_down',
	'pgm_volume_up',
	'pgm_volume_down',
	'pip_aspect_9_16',
	'pip_aspect_full',
	...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `pip_template_${n}`),
	'pip_x_add',
	'pip_x_sub',
	'pip_y_add',
	'pip_y_sub',
	'pip_size_x_add',
	'pip_size_x_sub',
	'pip_size_y_add',
	'pip_size_y_sub',
	...Array.from({ length: 16 }, (_, i) => `effect_mode_${i + 1}`),
	'ptz_reset',
	'ptz_focus_auto',
	'ptz_focus_manual',
	'ptz_up',
	'ptz_down',
	'ptz_left',
	'ptz_right',
	'ptz_stop',
	'background_toggle',
])

export const ACTION_SPECS: ActionSpec[] = [
	keyAction('pvw_source_1', 'PVW Source 1', 'Set Preview to Input 1', KEY_CODES.KEY_PVW_SOURCE_1),
	keyAction('pvw_source_2', 'PVW Source 2', 'Set Preview to Input 2', KEY_CODES.KEY_PVW_SOURCE_2),
	keyAction('pvw_source_3', 'PVW Source 3', 'Set Preview to Input 3', KEY_CODES.KEY_PVW_SOURCE_3),
	keyAction('pvw_source_4', 'PVW Source 4', 'Set Preview to Input 4', KEY_CODES.KEY_PVW_SOURCE_4),
	keyAction('pvw_source_5', 'PVW Source 5', 'Set Preview to Input 5', KEY_CODES.KEY_PVW_SOURCE_5),
	keyAction('pgm_source_1', 'PGM Source 1', 'Set Program to Input 1', KEY_CODES.KEY_PGM_SOURCE_1),
	keyAction('pgm_source_2', 'PGM Source 2', 'Set Program to Input 2', KEY_CODES.KEY_PGM_SOURCE_2),
	keyAction('pgm_source_3', 'PGM Source 3', 'Set Program to Input 3', KEY_CODES.KEY_PGM_SOURCE_3),
	keyAction('pgm_source_4', 'PGM Source 4', 'Set Program to Input 4', KEY_CODES.KEY_PGM_SOURCE_4),
	keyAction('pgm_source_5', 'PGM Source 5', 'Set Program to Input 5', KEY_CODES.KEY_PGM_SOURCE_5),

	// 新协议 25.5：JSON 命令 0xB0 0x60 0x04，index 0-3 对应 STREAM1-4，ispush 控制开/关；状态由 0xB1 0x58 校准
	customAction('stream_toggle_1', 'Stream 1 Toggle', 'Toggle stream 1 on/off', (instance) => instance.toggleStream(0)),
	customAction('stream_toggle_2', 'Stream 2 Toggle', 'Toggle stream 2 on/off', (instance) => instance.toggleStream(1)),
	customAction('stream_toggle_3', 'Stream 3 Toggle', 'Toggle stream 3 on/off', (instance) => instance.toggleStream(2)),
	customAction('stream_toggle_4', 'Stream 4 Toggle', 'Toggle stream 4 on/off', (instance) => instance.toggleStream(3)),

	// 新协议 5.1-5.3：媒体控制 CMD=0x12，DAT2：0x00 停止 / 0x01 播放 / 0x02 暂停；0x02 下一个 / 0x04 上一个
	commandAction('media_play', 'Media Play', 'Play current media file', 0x12, 0x00, 0x01),
	commandAction('media_pause', 'Media Pause', 'Pause current media file', 0x12, 0x00, 0x02),
	commandAction('media_stop', 'Media Stop', 'Stop current media file', 0x12, 0x00, 0x00),
	commandAction('media_previous', 'Previous Media', 'Play previous media file', 0x12, 0x04, 0x00),
	commandAction('media_next', 'Next Media', 'Play next media file', 0x12, 0x02, 0x00),

	keyAction('menu', 'Menu', 'Press MENU', KEY_CODES.KEY_PAD_MENU),
	keyAction('back', 'Back', 'Press BACK', KEY_CODES.KEY_PAD_BACK),
	keyAction('cut', 'Cut', 'Cut transition from PVW to PGM', KEY_CODES.KEY_PAD_CUT),
	keyAction('auto', 'Auto', 'Auto transition from PVW to PGM', KEY_CODES.KEY_PAD_AUTO),
	keyAction('ftb', 'FTB', 'Fade to Black', KEY_CODES.KEY_PAD_FTB),
	// 转场类型（产品功能6，方案A：面板按键；高亮由 0x31 0x01 读取的当前特效枚举驱动，0=MIX 1=DIP 3=WIPE）
	keyAction('transition_mix', 'Transition MIX', 'Set transition type to MIX', KEY_CODES.KEY_MIX),
	keyAction('transition_dip', 'Transition DIP', 'Set transition type to DIP', KEY_CODES.KEY_DIP),
	keyAction('transition_wipe', 'Transition WIPE', 'Set transition type to WIPE', KEY_CODES.KEY_WIRE),
	// PIP 开关 toggle（新协议 6.5：0x20 0x04，状态由 6.6 读取/设备上报刷新）
	customAction('pip_toggle', 'PIP Toggle', 'Toggle picture in picture on/off', (instance) => instance.togglePip()),
	// 图层 AB 选择（新协议 6.8：0x20 0x08，状态由 6.9 读取/设备上报刷新）
	customAction('layer_a', 'Layer A', 'Select Layer A', (instance) => instance.setLayer(1)),
	customAction('layer_b', 'Layer B', 'Select Layer B', (instance) => instance.setLayer(0)),
	keyAction('zoom_tele', 'Zoom Tele', 'Press ZOOM_TELE', KEY_CODES.KEY_ZOOM_TELE),
	keyAction('zoom_wide', 'Zoom Wide', 'Press ZOOM_WIDE', KEY_CODES.KEY_ZOOM_WIDE),
	// aiVoiceAction('lock', 'Lock', 'Lock the panel/screen', 0x3e),

	// 新协议 28.7/28.5/28.9：PTZ CMD=0x70（复位 DAT1=0x09；聚焦模式 DAT1=0x06；位置 DAT1=0x0B）
	commandAction('ptz_reset', 'PTZ Reset', 'Reset PTZ position', 0x70, 0x09, 0x00),
	commandAction('ptz_focus_auto', 'PTZ Auto Focus', 'Set PTZ focus mode to auto', 0x70, 0x06, 0x01, 0x01),
	commandAction('ptz_focus_manual', 'PTZ Manual Focus', 'Set PTZ focus mode to manual', 0x70, 0x06, 0x01, 0x00),
	commandAction('ptz_up', 'PTZ Up', 'Move PTZ up', 0x70, 0x0b, 0x01),
	commandAction('ptz_down', 'PTZ Down', 'Move PTZ down', 0x70, 0x0b, 0x02),
	commandAction('ptz_left', 'PTZ Left', 'Move PTZ left', 0x70, 0x0b, 0x04),
	commandAction('ptz_right', 'PTZ Right', 'Move PTZ right', 0x70, 0x0b, 0x08),
	commandAction('ptz_stop', 'PTZ Stop', 'Stop PTZ movement', 0x70, 0x0b, 0x00),

	// 新协议 6.10/6.7：画中画比例 CMD=0x20 DAT1=0x0A；画中画模式 CMD=0x20 DAT1=0x06
	commandAction('pip_aspect_9_16', 'PIP 9:16', 'Set PIP aspect to 9:16', 0x20, 0x0a, 0x01),
	commandAction('pip_aspect_full', 'PIP Full', 'Set PIP aspect to Full', 0x20, 0x0a, 0x00),
	commandAction('pip_template_1', 'PIP Template 1', 'Set PIP template 1', 0x20, 0x06, 0x01),
	commandAction('pip_template_2', 'PIP Template 2', 'Set PIP template 2', 0x20, 0x06, 0x02),
	commandAction('pip_template_3', 'PIP Template 3', 'Set PIP template 3', 0x20, 0x06, 0x03),
	commandAction('pip_template_4', 'PIP Template 4', 'Set PIP template 4', 0x20, 0x06, 0x04),
	commandAction('pip_template_5', 'PIP Template 5', 'Set PIP template 5', 0x20, 0x06, 0x05),
	commandAction('pip_template_6', 'PIP Template 6', 'Set PIP template 6', 0x20, 0x06, 0x07),
	commandAction('pip_template_7', 'PIP Template 7', 'Set PIP template 7', 0x20, 0x06, 0x08),
	commandAction('pip_template_8', 'PIP Template 8', 'Set PIP template 8', 0x20, 0x06, 0x09),
	aiVoiceAction('pip_x_add', 'PIP X +100', 'Increase PIP X position by one step', 0x67),
	aiVoiceAction('pip_x_sub', 'PIP X -100', 'Decrease PIP X position by one step', 0x68),
	aiVoiceAction('pip_y_add', 'PIP Y +100', 'Increase PIP Y position by one step', 0x69),
	aiVoiceAction('pip_y_sub', 'PIP Y -100', 'Decrease PIP Y position by one step', 0x6a),
	aiVoiceAction('pip_size_y_add', 'PIP Height +100', 'Increase PIP height by one step', 0x6b),
	aiVoiceAction('pip_size_y_sub', 'PIP Height -100', 'Decrease PIP height by one step', 0x6c),
	aiVoiceAction('pip_size_x_add', 'PIP Width +100', 'Increase PIP width by one step', 0x6d),
	aiVoiceAction('pip_size_x_sub', 'PIP Width -100', 'Decrease PIP width by one step', 0x6e),

	// 新协议 13.1：特效模式 CMD=0x31 DAT1=0x00，DAT2=0x00-0x0F
	commandAction('effect_mode_1', 'Effect Mode 1', 'Set effect mode 1', 0x31, 0x00, 0x00),
	commandAction('effect_mode_2', 'Effect Mode 2', 'Set effect mode 2', 0x31, 0x00, 0x01),
	commandAction('effect_mode_3', 'Effect Mode 3', 'Set effect mode 3', 0x31, 0x00, 0x02),
	commandAction('effect_mode_4', 'Effect Mode 4', 'Set effect mode 4', 0x31, 0x00, 0x03),
	commandAction('effect_mode_5', 'Effect Mode 5', 'Set effect mode 5', 0x31, 0x00, 0x04),
	commandAction('effect_mode_6', 'Effect Mode 6', 'Set effect mode 6', 0x31, 0x00, 0x05),
	commandAction('effect_mode_7', 'Effect Mode 7', 'Set effect mode 7', 0x31, 0x00, 0x06),
	commandAction('effect_mode_8', 'Effect Mode 8', 'Set effect mode 8', 0x31, 0x00, 0x07),
	commandAction('effect_mode_9', 'Effect Mode 9', 'Set effect mode 9', 0x31, 0x00, 0x08),
	commandAction('effect_mode_10', 'Effect Mode 10', 'Set effect mode 10', 0x31, 0x00, 0x09),
	commandAction('effect_mode_11', 'Effect Mode 11', 'Set effect mode 11', 0x31, 0x00, 0x0a),
	commandAction('effect_mode_12', 'Effect Mode 12', 'Set effect mode 12', 0x31, 0x00, 0x0b),
	commandAction('effect_mode_13', 'Effect Mode 13', 'Set effect mode 13', 0x31, 0x00, 0x0c),
	commandAction('effect_mode_14', 'Effect Mode 14', 'Set effect mode 14', 0x31, 0x00, 0x0d),
	commandAction('effect_mode_15', 'Effect Mode 15', 'Set effect mode 15', 0x31, 0x00, 0x0e),
	commandAction('effect_mode_16', 'Effect Mode 16', 'Set effect mode 16', 0x31, 0x00, 0x0f),

	// 新协议 26.2：录制 toggle（CMD=0xB0 DAT1=0x61 DAT2=0x01，状态由 0xB1 0x58 recordInfo 校准）
	customAction('record_toggle', 'Record Toggle', 'Toggle recording on/off', (instance) => instance.toggleRecord()),

	// 新协议 9.3/9.4：LOGO 开关（实测不区分 Preview/Program，统一 DAT2=0x00；toggle 后回读校准）
	customAction('logo_toggle', 'LOGO Toggle', 'Toggle logo overlay on/off', (instance) => instance.toggleLogo()),
	// 新协议 8.2/8.3：背景选择 CMD=0x22 DAT1=0x02；背景查询 CMD=0x22 DAT1=0x03
	customAction('background_toggle', 'Background Toggle', 'Cycle background image 1-6', async (instance) => {
		const current = await instance.queryBackground()
		const next = (current % 6) + 1
		await instance.sendCommand(0x22, 0x02, next, 0x00, 0x00)
	}),
	// 新协议 8.1：背景开关 toggle（CMD=0x22 DAT1=0x00，状态由 8.3 读取/设备上报刷新）
	customAction('background_power_toggle', 'Background On/Off', 'Toggle background layer on/off', (instance) =>
		instance.toggleBackgroundPower(),
	),
	// 新协议 10.1：抠像开关 toggle（状态由 10.3 读取/设备上报刷新）
	customAction('key_toggle', 'Key Toggle', 'Toggle keying on/off', (instance) => instance.toggleKey()),
	// 抠绿 / 抠蓝 实现为开启抠图（10.1）、设置色度模式（10.2：0x24 0x02 0x01），并发送协议表里的 green/blue 色度参数（10.4：0xB0 0x24 0x04）。
	customAction('key_green', 'Key Green', 'Enable chroma key and use green key parameters', async (instance) => {
		instance.setChromaHint('green')
		await instance.sendCommand(0x24, 0x00, 0x01, 0x00, 0x00)
		await instance.sendCommand(0x24, 0x02, 0x01, 0x00, 0x00)
		await instance.sendJsonCommand(0xb0, 0x24, 0x04, { min: 560, max: 1232, sat: 200 })
	}),
	customAction('key_blue', 'Key Blue', 'Enable chroma key and use blue key parameters', async (instance) => {
		instance.setChromaHint('blue')
		await instance.sendCommand(0x24, 0x00, 0x01, 0x00, 0x00)
		await instance.sendCommand(0x24, 0x02, 0x01, 0x00, 0x00)
		await instance.sendJsonCommand(0xb0, 0x24, 0x04, { min: 1600, max: 1984, sat: 200 })
	}),
	// ---- 产品新增功能（第一期）----

	// 新协议 15.1/15.2：输出静音 toggle（0x41 0x00，DAT2=0 监听(PVW)/1 PGM，状态由 15.2 读取/设备上报刷新）
	customAction('pvw_mute_toggle', 'PVW Mute Toggle', 'Toggle monitor (PVW) output mute on/off', (instance) =>
		instance.toggleMute(0),
	),
	customAction('pgm_mute_toggle', 'PGM Mute Toggle', 'Toggle program output mute on/off', (instance) =>
		instance.toggleMute(1),
	),

	// 新协议 14.1：AFV 1-5 路分别 toggle（HDMI1-4 + MEDIA，DAT3=通道 0-4，状态由读取/设备上报刷新）
	customAction('afv_toggle_1', 'AFV 1 Toggle', 'Toggle AFV for HDMI1', (instance) => instance.toggleAfv(0)),
	customAction('afv_toggle_2', 'AFV 2 Toggle', 'Toggle AFV for HDMI2', (instance) => instance.toggleAfv(1)),
	customAction('afv_toggle_3', 'AFV 3 Toggle', 'Toggle AFV for HDMI3', (instance) => instance.toggleAfv(2)),
	customAction('afv_toggle_4', 'AFV 4 Toggle', 'Toggle AFV for HDMI4', (instance) => instance.toggleAfv(3)),
	customAction('afv_toggle_5', 'AFV 5 Toggle', 'Toggle AFV for MEDIA', (instance) => instance.toggleAfv(4)),

	// 新协议 15.3/15.4：输出音量 ±1（读取 0x41 0x03 取当前值后步进写入 0x41 0x02；0=监听(PVW)/1=PGM）
	customAction('pvw_volume_up', 'PVW Vol +1', 'Increase monitor (PVW) volume by 1', (instance) =>
		instance.stepVolume(0, 1),
	),
	customAction('pvw_volume_down', 'PVW Vol -1', 'Decrease monitor (PVW) volume by 1', (instance) =>
		instance.stepVolume(0, -1),
	),
	customAction('pgm_volume_up', 'PGM Vol +1', 'Increase program volume by 1', (instance) => instance.stepVolume(1, 1)),
	customAction('pgm_volume_down', 'PGM Vol -1', 'Decrease program volume by 1', (instance) =>
		instance.stepVolume(1, -1),
	),

	// 新协议 12.1/12.4：预设模式（场景）调用 1-8；当前场景已激活时再次点击则退出（0x30 0x04）
	customAction('scene_recall_1', 'Scene 1', 'Recall scene preset 1 (tap again to exit)', (instance) =>
		instance.toggleScene(1),
	),
	customAction('scene_recall_2', 'Scene 2', 'Recall scene preset 2 (tap again to exit)', (instance) =>
		instance.toggleScene(2),
	),
	customAction('scene_recall_3', 'Scene 3', 'Recall scene preset 3 (tap again to exit)', (instance) =>
		instance.toggleScene(3),
	),
	customAction('scene_recall_4', 'Scene 4', 'Recall scene preset 4 (tap again to exit)', (instance) =>
		instance.toggleScene(4),
	),
	customAction('scene_recall_5', 'Scene 5', 'Recall scene preset 5 (tap again to exit)', (instance) =>
		instance.toggleScene(5),
	),
	customAction('scene_recall_6', 'Scene 6', 'Recall scene preset 6 (tap again to exit)', (instance) =>
		instance.toggleScene(6),
	),
	customAction('scene_recall_7', 'Scene 7', 'Recall scene preset 7 (tap again to exit)', (instance) =>
		instance.toggleScene(7),
	),
	customAction('scene_recall_8', 'Scene 8', 'Recall scene preset 8 (tap again to exit)', (instance) =>
		instance.toggleScene(8),
	),
]

export function UpdateActions(self: ModuleInstance): void {
	const actions: CompanionActionDefinitions<ActionsSchema> = {}

	for (const action of ACTION_SPECS) {
		actions[action.id] = {
			name: action.name,
			description: action.description,
			options: NO_OPTIONS,
			callback: async () => {
				// 瞬时动作按下瞬间即闪烁高亮（不等执行完成：如 background_toggle 需先查询背景索引，最长 1s）
				if (FLASH_ACTIONS.has(action.id)) {
					self.flashAction(action.id)
				}
				await action.run(self)
			},
		}
	}

	self.setActionDefinitions(actions)
}
