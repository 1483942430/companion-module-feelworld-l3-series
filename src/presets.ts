import type { CompanionPresetDefinitions, CompanionPresetSection } from '@companion-module/base'
import type ModuleInstance from './main.js'
import type { ModuleSchema } from './main.js'
import { ACTION_SPECS, FLASH_ACTIONS } from './actions.js'

type PresetStyle = {
	text: string
	bgcolor: number
	color?: number
}

const CATEGORY_BY_ACTION: Record<string, string> = {
	pvw_source_1: 'Preview',
	pvw_source_2: 'Preview',
	pvw_source_3: 'Preview',
	pvw_source_4: 'Preview',
	pvw_source_5: 'Preview',
	pgm_source_1: 'Program',
	pgm_source_2: 'Program',
	pgm_source_3: 'Program',
	pgm_source_4: 'Program',
	pgm_source_5: 'Program',
	stream_toggle_1: 'Streaming',
	stream_toggle_2: 'Streaming',
	stream_toggle_3: 'Streaming',
	stream_toggle_4: 'Streaming',
	media_play: 'Media',
	media_pause: 'Media',
	media_stop: 'Media',
	media_previous: 'Media',
	media_next: 'Media',
	menu: 'Control',
	back: 'Control',
	cut: 'Transition',
	auto: 'Transition',
	ftb: 'Transition',
	transition_mix: 'Transition',
	transition_dip: 'Transition',
	transition_wipe: 'Transition',
	pip_toggle: 'PIP',
	layer_a: 'Layers',
	layer_b: 'Layers',
	zoom_tele: 'Zoom',
	zoom_wide: 'Zoom',
	lock: 'Control',
	ptz_reset: 'PTZ',
	ptz_focus_auto: 'PTZ',
	ptz_focus_manual: 'PTZ',
	ptz_up: 'PTZ',
	ptz_down: 'PTZ',
	ptz_left: 'PTZ',
	ptz_right: 'PTZ',
	ptz_stop: 'PTZ',
	pip_aspect_9_16: 'PIP',
	pip_aspect_full: 'PIP',
	pip_template_1: 'PIP Templates',
	pip_template_2: 'PIP Templates',
	pip_template_3: 'PIP Templates',
	pip_template_4: 'PIP Templates',
	pip_template_5: 'PIP Templates',
	pip_template_6: 'PIP Templates',
	pip_template_7: 'PIP Templates',
	pip_template_8: 'PIP Templates',
	pip_x_add: 'PIP Adjust',
	pip_x_sub: 'PIP Adjust',
	pip_y_add: 'PIP Adjust',
	pip_y_sub: 'PIP Adjust',
	pip_size_y_add: 'PIP Adjust',
	pip_size_y_sub: 'PIP Adjust',
	pip_size_x_add: 'PIP Adjust',
	pip_size_x_sub: 'PIP Adjust',
	effect_mode_1: 'Effect Templates',
	effect_mode_2: 'Effect Templates',
	effect_mode_3: 'Effect Templates',
	effect_mode_4: 'Effect Templates',
	effect_mode_5: 'Effect Templates',
	effect_mode_6: 'Effect Templates',
	effect_mode_7: 'Effect Templates',
	effect_mode_8: 'Effect Templates',
	effect_mode_9: 'Effect Templates',
	effect_mode_10: 'Effect Templates',
	effect_mode_11: 'Effect Templates',
	effect_mode_12: 'Effect Templates',
	effect_mode_13: 'Effect Templates',
	effect_mode_14: 'Effect Templates',
	effect_mode_15: 'Effect Templates',
	effect_mode_16: 'Effect Templates',
	record_toggle: 'Recording',
	logo_toggle: 'Logo',
	background_toggle: 'Background',
	background_power_toggle: 'Background',
	key_toggle: 'Keying',
	key_green: 'Keying',
	key_blue: 'Keying',
	pvw_mute_toggle: 'Audio',
	pgm_mute_toggle: 'Audio',
	afv_toggle_1: 'Audio',
	afv_toggle_2: 'Audio',
	afv_toggle_3: 'Audio',
	afv_toggle_4: 'Audio',
	afv_toggle_5: 'Audio',
	pvw_volume_up: 'Audio',
	pvw_volume_down: 'Audio',
	pgm_volume_up: 'Audio',
	pgm_volume_down: 'Audio',
	scene_recall_1: 'Scenes',
	scene_recall_2: 'Scenes',
	scene_recall_3: 'Scenes',
	scene_recall_4: 'Scenes',
	scene_recall_5: 'Scenes',
	scene_recall_6: 'Scenes',
	scene_recall_7: 'Scenes',
	scene_recall_8: 'Scenes',
}

const STYLE_BY_ACTION: Record<string, PresetStyle> = {
	stream_toggle_1: { text: 'STREAM\n1', bgcolor: 0xff0000 },
	stream_toggle_2: { text: 'STREAM\n2', bgcolor: 0xff0000 },
	stream_toggle_3: { text: 'STREAM\n3', bgcolor: 0xff0000 },
	stream_toggle_4: { text: 'STREAM\n4', bgcolor: 0xff0000 },
	media_play: { text: 'PLAY', bgcolor: 0x00aa00 },
	media_pause: { text: 'PAUSE', bgcolor: 0xffcc00, color: 0x000000 },
	media_stop: { text: 'STOP', bgcolor: 0x666666 },
	media_previous: { text: 'PREV', bgcolor: 0x333399 },
	media_next: { text: 'NEXT', bgcolor: 0x333399 },
	menu: { text: 'MENU', bgcolor: 0x333333 },
	back: { text: 'BACK', bgcolor: 0x333333 },
	cut: { text: 'CUT', bgcolor: 0x8b0000 },
	auto: { text: 'AUTO', bgcolor: 0x006400 },
	ftb: { text: 'FTB', bgcolor: 0x000000 },
	pip_toggle: { text: 'PIP', bgcolor: 0x2f4f4f },
	layer_a: { text: 'A', bgcolor: 0x00a2ff },
	layer_b: { text: 'B', bgcolor: 0xff8c00 },
	zoom_tele: { text: 'ZOOM\nTELE', bgcolor: 0x444444 },
	zoom_wide: { text: 'ZOOM\nWIDE', bgcolor: 0x444444 },
	lock: { text: 'LOCK', bgcolor: 0x111111 },
	ptz_reset: { text: 'PTZ\nRESET', bgcolor: 0x444444 },
	ptz_focus_auto: { text: 'FOCUS\nAUTO', bgcolor: 0x446600 },
	ptz_focus_manual: { text: 'FOCUS\nMAN', bgcolor: 0x665500 },
	ptz_up: { text: 'PTZ\nUP', bgcolor: 0x222266 },
	ptz_down: { text: 'PTZ\nDOWN', bgcolor: 0x222266 },
	ptz_left: { text: 'PTZ\nLEFT', bgcolor: 0x222266 },
	ptz_right: { text: 'PTZ\nRIGHT', bgcolor: 0x222266 },
	ptz_stop: { text: 'PTZ\nSTOP', bgcolor: 0x880000 },
	pip_aspect_9_16: { text: 'PIP\n9:16', bgcolor: 0x2f4f4f },
	pip_aspect_full: { text: 'PIP\nFULL', bgcolor: 0x2f4f4f },
	pip_x_add: { text: 'PIP X\n+100', bgcolor: 0x2f4f4f },
	pip_x_sub: { text: 'PIP X\n-100', bgcolor: 0x2f4f4f },
	pip_y_add: { text: 'PIP Y\n+100', bgcolor: 0x2f4f4f },
	pip_y_sub: { text: 'PIP Y\n-100', bgcolor: 0x2f4f4f },
	pip_size_y_add: { text: 'PIP H\n+100', bgcolor: 0x2f4f4f },
	pip_size_y_sub: { text: 'PIP H\n-100', bgcolor: 0x2f4f4f },
	pip_size_x_add: { text: 'PIP W\n+100', bgcolor: 0x2f4f4f },
	pip_size_x_sub: { text: 'PIP W\n-100', bgcolor: 0x2f4f4f },
	record_toggle: { text: 'REC', bgcolor: 0xff0000 },
	logo_toggle: { text: 'LOGO', bgcolor: 0x4b0082 },
	background_toggle: { text: 'BKGD\nNEXT', bgcolor: 0x6b5b00 },
	background_power_toggle: { text: 'BKGD\nON/OFF', bgcolor: 0x6b5b00 },
	key_toggle: { text: 'KEY', bgcolor: 0x444444 },
	key_green: { text: 'KEY\nGREEN', bgcolor: 0x008000 },
	key_blue: { text: 'KEY\nBLUE', bgcolor: 0x0000cc },
	transition_mix: { text: 'T-MIX', bgcolor: 0x00ced1 },
	transition_dip: { text: 'T-DIP', bgcolor: 0x00ced1 },
	transition_wipe: { text: 'T-WIPE', bgcolor: 0x00ced1 },
	pvw_mute_toggle: { text: 'MUTE\nPVW', bgcolor: 0xff0000 },
	pgm_mute_toggle: { text: 'MUTE\nPGM', bgcolor: 0xff0000 },
	afv_toggle_1: { text: 'AFV 1', bgcolor: 0x226688 },
	afv_toggle_2: { text: 'AFV 2', bgcolor: 0x226688 },
	afv_toggle_3: { text: 'AFV 3', bgcolor: 0x226688 },
	afv_toggle_4: { text: 'AFV 4', bgcolor: 0x226688 },
	afv_toggle_5: { text: 'AFV 5', bgcolor: 0x226688 },
	pvw_volume_up: { text: 'VOL+\nPVW', bgcolor: 0x228822 },
	pvw_volume_down: { text: 'VOL-\nPVW', bgcolor: 0x886622 },
	pgm_volume_up: { text: 'VOL+\nPGM', bgcolor: 0x228822 },
	pgm_volume_down: { text: 'VOL-\nPGM', bgcolor: 0x886622 },
	scene_recall_1: { text: 'SCN 1', bgcolor: 0x6644aa },
	scene_recall_2: { text: 'SCN 2', bgcolor: 0x6644aa },
	scene_recall_3: { text: 'SCN 3', bgcolor: 0x6644aa },
	scene_recall_4: { text: 'SCN 4', bgcolor: 0x6644aa },
	scene_recall_5: { text: 'SCN 5', bgcolor: 0x6644aa },
	scene_recall_6: { text: 'SCN 6', bgcolor: 0x6644aa },
	scene_recall_7: { text: 'SCN 7', bgcolor: 0x6644aa },
	scene_recall_8: { text: 'SCN 8', bgcolor: 0x6644aa },
}

function defaultStyle(actionId: string): PresetStyle {
	const pipTemplate = actionId.match(/^pip_template_(\d)$/)
	if (pipTemplate) {
		return { text: `PIP\nTPL ${pipTemplate[1]}`, bgcolor: 0x2f4f4f }
	}

	const effectTemplate = actionId.match(/^effect_mode_(\d+)$/)
	if (effectTemplate) {
		return { text: `FX\n${effectTemplate[1]}`, bgcolor: 0x00ced1 }
	}

	return STYLE_BY_ACTION[actionId] ?? { text: actionId.toUpperCase(), bgcolor: 0x222222 }
}

/**
 * 统一配色（产品规范）：
 * 默认：背景 #151B24，文字 #98A3B4
 * 高亮（除 PGM1-5）：背景 #1B493A，文字 #B6F5D3
 * PGM1-5 高亮：背景 #28181C，文字 #FFC0BB
 */
const DEFAULT_BG = 0x151b24
const DEFAULT_COLOR = 0x98a3b4
const ACTIVE_BG = 0x1b493a
const ACTIVE_COLOR = 0xb6f5d3
// const ACTIVE_BG = 0x645333
// const ACTIVE_COLOR = 0xFFDDA0
const PGM_ACTIVE_BG = 0xb71f16
const PGM_ACTIVE_COLOR = 0xffc0bb

/**
 * 预设按钮自动携带的状态高亮 Feedback（Action ID → Feedback 定义 + 选项 + 激活态样式）。
 * style 为激活时的覆盖样式（必须显式提供，否则预览/激活渲染会缺样式）。
 */
const FEEDBACK_BY_ACTION: Record<
	string,
	{ feedbackId: string; options?: Record<string, any>; style: { bgcolor: number; color: number } }
> = {
	ftb: { feedbackId: 'ftb_active', style: { bgcolor: ACTIVE_BG, color: ACTIVE_COLOR } },
	pip_toggle: { feedbackId: 'pip_active', style: { bgcolor: ACTIVE_BG, color: ACTIVE_COLOR } },
	key_toggle: { feedbackId: 'key_active', style: { bgcolor: ACTIVE_BG, color: ACTIVE_COLOR } },
	key_green: { feedbackId: 'key_green_active', style: { bgcolor: ACTIVE_BG, color: ACTIVE_COLOR } },
	key_blue: { feedbackId: 'key_blue_active', style: { bgcolor: ACTIVE_BG, color: ACTIVE_COLOR } },
	logo_toggle: { feedbackId: 'logo_active', style: { bgcolor: ACTIVE_BG, color: ACTIVE_COLOR } },
	background_power_toggle: { feedbackId: 'background_active', style: { bgcolor: ACTIVE_BG, color: ACTIVE_COLOR } },
	pvw_mute_toggle: { feedbackId: 'pvw_mute_active', style: { bgcolor: ACTIVE_BG, color: ACTIVE_COLOR } },
	pgm_mute_toggle: { feedbackId: 'pgm_mute_active', style: { bgcolor: ACTIVE_BG, color: ACTIVE_COLOR } },
	afv_toggle_1: { feedbackId: 'afv_1_active', style: { bgcolor: ACTIVE_BG, color: ACTIVE_COLOR } },
	afv_toggle_2: { feedbackId: 'afv_2_active', style: { bgcolor: ACTIVE_BG, color: ACTIVE_COLOR } },
	afv_toggle_3: { feedbackId: 'afv_3_active', style: { bgcolor: ACTIVE_BG, color: ACTIVE_COLOR } },
	afv_toggle_4: { feedbackId: 'afv_4_active', style: { bgcolor: ACTIVE_BG, color: ACTIVE_COLOR } },
	afv_toggle_5: { feedbackId: 'afv_5_active', style: { bgcolor: ACTIVE_BG, color: ACTIVE_COLOR } },
	stream_toggle_1: { feedbackId: 'stream_1_active', style: { bgcolor: ACTIVE_BG, color: ACTIVE_COLOR } },
	stream_toggle_2: { feedbackId: 'stream_2_active', style: { bgcolor: ACTIVE_BG, color: ACTIVE_COLOR } },
	stream_toggle_3: { feedbackId: 'stream_3_active', style: { bgcolor: ACTIVE_BG, color: ACTIVE_COLOR } },
	stream_toggle_4: { feedbackId: 'stream_4_active', style: { bgcolor: ACTIVE_BG, color: ACTIVE_COLOR } },
	layer_a: { feedbackId: 'layer_a_active', style: { bgcolor: ACTIVE_BG, color: ACTIVE_COLOR } },
	layer_b: { feedbackId: 'layer_b_active', style: { bgcolor: ACTIVE_BG, color: ACTIVE_COLOR } },
	transition_mix: { feedbackId: 'transition_mix_active', style: { bgcolor: ACTIVE_BG, color: ACTIVE_COLOR } },
	transition_dip: { feedbackId: 'transition_dip_active', style: { bgcolor: ACTIVE_BG, color: ACTIVE_COLOR } },
	transition_wipe: { feedbackId: 'transition_wipe_active', style: { bgcolor: ACTIVE_BG, color: ACTIVE_COLOR } },
	scene_recall_1: {
		feedbackId: 'scene_active',
		options: { scene: '1' },
		style: { bgcolor: ACTIVE_BG, color: ACTIVE_COLOR },
	},
	scene_recall_2: {
		feedbackId: 'scene_active',
		options: { scene: '2' },
		style: { bgcolor: ACTIVE_BG, color: ACTIVE_COLOR },
	},
	scene_recall_3: {
		feedbackId: 'scene_active',
		options: { scene: '3' },
		style: { bgcolor: ACTIVE_BG, color: ACTIVE_COLOR },
	},
	scene_recall_4: {
		feedbackId: 'scene_active',
		options: { scene: '4' },
		style: { bgcolor: ACTIVE_BG, color: ACTIVE_COLOR },
	},
	scene_recall_5: {
		feedbackId: 'scene_active',
		options: { scene: '5' },
		style: { bgcolor: ACTIVE_BG, color: ACTIVE_COLOR },
	},
	scene_recall_6: {
		feedbackId: 'scene_active',
		options: { scene: '6' },
		style: { bgcolor: ACTIVE_BG, color: ACTIVE_COLOR },
	},
	scene_recall_7: {
		feedbackId: 'scene_active',
		options: { scene: '7' },
		style: { bgcolor: ACTIVE_BG, color: ACTIVE_COLOR },
	},
	scene_recall_8: {
		feedbackId: 'scene_active',
		options: { scene: '8' },
		style: { bgcolor: ACTIVE_BG, color: ACTIVE_COLOR },
	},
}

// 瞬时动作预设自动携带闪烁高亮
for (const flashId of FLASH_ACTIONS) {
	FEEDBACK_BY_ACTION[flashId] = {
		feedbackId: 'flash_active',
		options: { actionId: flashId },
		style: { bgcolor: ACTIVE_BG, color: ACTIVE_COLOR },
	}
}

// 需要携带多个 Feedback 的预设（覆盖 FEEDBACK_BY_ACTION 中的单条定义）
const EXTRA_FEEDBACKS: Record<
	string,
	Array<{ feedbackId: string; options?: Record<string, any>; style: Record<string, any> }>
> = {
	record_toggle: [
		{ feedbackId: 'record_active', style: { bgcolor: ACTIVE_BG, color: ACTIVE_COLOR } },
		{ feedbackId: 'record_no_disk', options: {}, style: { bgcolor: 0xffff00, color: 0x000000, text: 'NO\nDISK' } },
	],
	stream_toggle_1: [
		{ feedbackId: 'stream_1_active', style: { bgcolor: ACTIVE_BG, color: ACTIVE_COLOR } },
		{
			feedbackId: 'stream_no_addr',
			options: { index: '0' },
			style: { bgcolor: 0xffff00, color: 0x000000, text: 'ADDRESS\nEMPTY' },
		},
	],
	stream_toggle_2: [
		{ feedbackId: 'stream_2_active', style: { bgcolor: ACTIVE_BG, color: ACTIVE_COLOR } },
		{
			feedbackId: 'stream_no_addr',
			options: { index: '1' },
			style: { bgcolor: 0xffff00, color: 0x000000, text: 'ADDRESS\nEMPTY' },
		},
	],
	stream_toggle_3: [
		{ feedbackId: 'stream_3_active', style: { bgcolor: ACTIVE_BG, color: ACTIVE_COLOR } },
		{
			feedbackId: 'stream_no_addr',
			options: { index: '2' },
			style: { bgcolor: 0xffff00, color: 0x000000, text: 'ADDRESS\nEMPTY' },
		},
	],
	stream_toggle_4: [
		{ feedbackId: 'stream_4_active', style: { bgcolor: ACTIVE_BG, color: ACTIVE_COLOR } },
		{
			feedbackId: 'stream_no_addr',
			options: { index: '3' },
			style: { bgcolor: 0xffff00, color: 0x000000, text: 'ADDRESS\nEMPTY' },
		},
	],
}

export function UpdatePresets(self: ModuleInstance): void {
	const presets: CompanionPresetDefinitions<ModuleSchema> = {}

	for (const action of ACTION_SPECS) {
		const style = defaultStyle(action.id)
		const source = action.id.match(/^(pvw|pgm)_source_(\d)$/)
		const attachedFeedback =
			EXTRA_FEEDBACKS[action.id] ?? (FEEDBACK_BY_ACTION[action.id] ? [FEEDBACK_BY_ACTION[action.id]] : [])

		const feedbacks = source
			? [
					{
						feedbackId: `${source[1]}_source`,
						// 按钮 N 对应设备通道 N-1（0 起始编号）
						options: { source: String(Number(source[2]) - 1) },
						style:
							source[1] === 'pgm'
								? { bgcolor: PGM_ACTIVE_BG, color: PGM_ACTIVE_COLOR }
								: { bgcolor: ACTIVE_BG, color: ACTIVE_COLOR },
					},
				]
			: attachedFeedback.map((f) => ({
					feedbackId: f.feedbackId,
					options: f.options ?? {},
					style: f.style,
				}))

		presets[action.id] = {
			type: 'simple',
			name: action.name,
			style: {
				text: source ? `${source[1].toUpperCase()}\n${source[2]}` : style.text,
				size: '14',
				bgcolor: DEFAULT_BG,
				color: DEFAULT_COLOR,
			},
			feedbacks,
			steps: [
				{
					down: [{ actionId: action.id, options: {} }],
					up: [],
				},
			],
		}
	}

	// 新 API：预设按分类组织为 sections（每组一个 simple group）
	const categoryOrder: string[] = []
	const presetsByCategory: Record<string, string[]> = {}
	for (const action of ACTION_SPECS) {
		const category = CATEGORY_BY_ACTION[action.id] ?? 'Other'
		if (!presetsByCategory[category]) {
			presetsByCategory[category] = []
			categoryOrder.push(category)
		}
		presetsByCategory[category].push(action.id)
	}

	const structure: CompanionPresetSection<ModuleSchema>[] = categoryOrder.map((category) => ({
		id: `section_${category.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
		name: category,
		definitions: [
			{
				id: `group_${category.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
				name: category,
				type: 'simple',
				presets: presetsByCategory[category],
			},
		],
	}))

	self.setPresetDefinitions(structure, presets)
}
