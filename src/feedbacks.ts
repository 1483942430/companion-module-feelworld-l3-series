import type {
	CompanionBooleanFeedbackDefinition,
	CompanionFeedbackDefinitions,
	CompanionFeedbackBooleanEvent,
	CompanionOptionValues,
	SomeCompanionFeedbackInputField,
} from '@companion-module/base'
import type ModuleInstance from './main.js'
import { ACTION_SPECS, FLASH_ACTIONS } from './actions.js'

export type FeedbacksSchema = Record<string, { type: 'boolean'; options: CompanionOptionValues }>

const NO_OPTIONS: SomeCompanionFeedbackInputField[] = []

// 设备通道编号为 0 起始：HDMI1-4 = 0-3，MEDIA = 4（实测确认）
const SOURCE_OPTIONS: SomeCompanionFeedbackInputField[] = [
	{
		type: 'dropdown',
		label: 'Source',
		id: 'source',
		default: '0',
		choices: [
			{ id: '0', label: 'Input 1' },
			{ id: '1', label: 'Input 2' },
			{ id: '2', label: 'Input 3' },
			{ id: '3', label: 'Input 4' },
			{ id: '4', label: 'Media' },
		],
	},
]

const SCENE_OPTIONS: SomeCompanionFeedbackInputField[] = [
	{
		type: 'dropdown',
		label: 'Scene',
		id: 'scene',
		default: '1',
		choices: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ id: String(n), label: `Scene ${n}` })),
	},
]

/**
 * 统一配色（产品规范）：
 * 默认：背景 #151B24，文字 #98A3B4
 * 高亮（除 PGM1-5）：背景 #1B493A，文字 #B6F5D3
 * PGM1-5 高亮：背景 #28181C，文字 #FFC0BB
 */
const ACTIVE_BG = 0x1b493a
const ACTIVE_COLOR = 0xb6f5d3
const PGM_ACTIVE_BG = 0x28181c
const PGM_ACTIVE_COLOR = 0xffc0bb

/** 生成简单的开关型高亮 Feedback（默认使用统一高亮配色） */
const boolFeedback = (
	_id: string,
	name: string,
	description: string,
	callback: () => boolean,
	bgcolor = ACTIVE_BG,
	color = ACTIVE_COLOR,
): CompanionBooleanFeedbackDefinition<CompanionOptionValues> => ({
	type: 'boolean',
	name,
	description,
	defaultStyle: { bgcolor, color },
	options: NO_OPTIONS,
	callback: () => callback(),
})

export function UpdateFeedbacks(self: ModuleInstance): void {
	const feedbacks: CompanionFeedbackDefinitions<FeedbacksSchema> = {}

	feedbacks['pgm_source'] = {
		type: 'boolean',
		name: 'PGM Source Indicator',
		description: 'Highlight when a specific source is on Program',
		defaultStyle: {
			bgcolor: PGM_ACTIVE_BG,
			color: PGM_ACTIVE_COLOR,
		},
		options: SOURCE_OPTIONS,
		callback: (feedback: CompanionFeedbackBooleanEvent) => {
			const source = parseInt((feedback.options.source as string) || '0')
			return self.getCurrentPgm() === source
		},
	}

	feedbacks['pvw_source'] = {
		type: 'boolean',
		name: 'PVW Source Indicator',
		description: 'Highlight when a specific source is on Preview',
		defaultStyle: {
			bgcolor: ACTIVE_BG,
			color: ACTIVE_COLOR,
		},
		options: SOURCE_OPTIONS,
		callback: (feedback: CompanionFeedbackBooleanEvent) => {
			const source = parseInt((feedback.options.source as string) || '0')
			return self.getCurrentPvw() === source
		},
	}

	feedbacks['pgm_pvw_same'] = {
		type: 'boolean',
		name: 'PGM/PVW Match Alert',
		description: 'Highlight when Program and Preview are the same',
		defaultStyle: {
			bgcolor: 0xffff00,
			color: 0x000000,
		},
		options: NO_OPTIONS,
		callback: () => {
			return self.getCurrentPgm() === self.getCurrentPvw() && self.getCurrentPgm() !== 0
		},
	}

	// ---- 第一期：开关型功能状态高亮 ----

	feedbacks['pip_active'] = boolFeedback(
		'pip_active',
		'PIP Active',
		'Highlight when picture in picture is enabled',
		() => self.getPipEnabled(),
	)

	feedbacks['key_active'] = boolFeedback(
		'key_active',
		'Key Active',
		'Highlight when keying is enabled (chroma or luma)',
		() => self.getKeyMode() !== 0,
	)

	// 绿幕/蓝幕互斥高亮（keyInfo.chromaInfo.color 按 RGB 判定，无法区分时回退最后下发值）
	feedbacks['key_green_active'] = boolFeedback(
		'key_green_active',
		'Chroma Key Green Active',
		'Highlight when chroma keying is enabled with green parameters',
		() => self.getKeyMode() === 1 && self.getChromaClass() === 'green',
	)
	feedbacks['key_blue_active'] = boolFeedback(
		'key_blue_active',
		'Chroma Key Blue Active',
		'Highlight when chroma keying is enabled with blue parameters',
		() => self.getKeyMode() === 1 && self.getChromaClass() === 'blue',
	)

	feedbacks['logo_active'] = boolFeedback('logo_active', 'LOGO Active', 'Highlight when logo overlay is enabled', () =>
		self.getLogoEnabled(),
	)

	feedbacks['background_active'] = boolFeedback(
		'background_active',
		'Background Active',
		'Highlight when background layer is enabled',
		() => self.getBackgroundEnabled(),
	)

	feedbacks['pvw_mute_active'] = boolFeedback(
		'pvw_mute_active',
		'PVW Mute Active',
		'Highlight when monitor (PVW) output is muted',
		() => self.getPvwMute(),
	)

	feedbacks['pgm_mute_active'] = boolFeedback(
		'pgm_mute_active',
		'PGM Mute Active',
		'Highlight when program output is muted',
		() => self.getPgmMute(),
	)

	// AFV 1-5 路分别高亮（HDMI1-4 + MEDIA）
	for (let ch = 0; ch < 5; ch++) {
		const channel = ch
		feedbacks[`afv_${channel + 1}_active`] = boolFeedback(
			`afv_${channel + 1}_active`,
			`AFV ${channel + 1} Active`,
			`Highlight when AFV is enabled for ${channel < 4 ? `HDMI${channel + 1}` : 'MEDIA'}`,
			() => self.getAfvState(channel),
		)
	}

	// 当前场景单选高亮
	feedbacks['scene_active'] = {
		type: 'boolean',
		name: 'Scene Active',
		description: 'Highlight when the selected scene preset is currently active',
		defaultStyle: { bgcolor: 0x00ff00, color: 0x000000 },
		options: SCENE_OPTIONS,
		callback: (feedback: CompanionFeedbackBooleanEvent) => {
			const scene = parseInt((feedback.options.scene as string) || '0')
			return self.getCurrentScene() === scene
		},
	}

	// 图层 AB 单选高亮
	feedbacks['layer_a_active'] = boolFeedback(
		'layer_a_active',
		'Layer A Selected',
		'Highlight when Layer A is selected',
		() => self.getLayerSel() === 1,
	)
	feedbacks['layer_b_active'] = boolFeedback(
		'layer_b_active',
		'Layer B Selected',
		'Highlight when Layer B is selected',
		() => self.getLayerSel() === 0,
	)

	// 推流 1-4 路分别高亮（状态由 0xB1 0x58 streamInfo 校准）
	for (let i = 0; i < 4; i++) {
		const index = i
		feedbacks[`stream_${index + 1}_active`] = boolFeedback(
			`stream_${index + 1}_active`,
			`Stream ${index + 1} Active`,
			`Highlight when stream ${index + 1} is pushing`,
			() => self.getStreamPush(index),
		)
	}

	// 录制高亮（状态由 0xB1 0x58 recordInfo 校准）
	feedbacks['record_active'] = boolFeedback(
		'record_active',
		'Recording Active',
		'Highlight when recording is in progress',
		() => self.getRecordEnabled(),
	)

	// 无 U 盘警告（开始录制被拦截时短暂显示）
	feedbacks['record_no_disk'] = boolFeedback(
		'record_no_disk',
		'Recording Warn: No Disk',
		'Shows NO DISK warning when a record start was blocked by missing USB disk',
		() => self.isRecordWarn(),
		0xffff00,
		0x000000,
	)

	// 推流地址为空警告（开启推流未获 b158 确认时短暂显示）
	feedbacks['stream_no_addr'] = {
		type: 'boolean',
		name: 'Stream Warn: Address Empty',
		description:
			'Shows ADDRESS EMPTY warning when a stream start got no confirmation from device (stream address is empty)',
		defaultStyle: { bgcolor: 0xffff00, color: 0x000000, text: 'ADDR.\nEMPTY' },
		options: [
			{
				type: 'dropdown',
				label: 'Stream',
				id: 'index',
				default: '0',
				choices: [0, 1, 2, 3].map((n) => ({ id: String(n), label: `Stream ${n + 1}` })),
			},
		],
		callback: (feedback: CompanionFeedbackBooleanEvent) => {
			const index = parseInt((feedback.options.index as string) || '0')
			return self.isStreamWarn(index)
		},
	}

	// 瞬时动作闪烁高亮
	const FLASH_CHOICES = [...FLASH_ACTIONS].map((id) => ({
		id,
		label: ACTION_SPECS.find((a) => a.id === id)?.name ?? id,
	}))
	feedbacks['flash_active'] = {
		type: 'boolean',
		name: 'Action Flash',
		description: 'Briefly highlight when the selected action runs',
		defaultStyle: { bgcolor: ACTIVE_BG, color: ACTIVE_COLOR },
		options: [
			{
				type: 'dropdown',
				label: 'Action',
				id: 'actionId',
				default: 'cut',
				choices: FLASH_CHOICES,
			},
		],
		callback: (feedback: CompanionFeedbackBooleanEvent) => {
			const actionId = feedback.options.actionId as string
			return self.isFlashing(actionId)
		},
	}

	// FTB 黑场高亮（状态由 13.9 读取 / 0xB1 0x58 transInfo.ftbEnable 刷新）
	feedbacks['ftb_active'] = boolFeedback('ftb_active', 'FTB Active', 'Highlight when fade to black is active', () =>
		self.getFtbEnabled(),
	)

	// 转场类型单选高亮（0=MIX，1=DIP，3=WIPE，由 13.2 读取/设备上报刷新）
	feedbacks['transition_mix_active'] = boolFeedback(
		'transition_mix_active',
		'Transition MIX Selected',
		'Highlight when transition type is MIX',
		() => self.getEffectType() === 0,
	)
	feedbacks['transition_dip_active'] = boolFeedback(
		'transition_dip_active',
		'Transition DIP Selected',
		'Highlight when transition type is DIP',
		() => self.getEffectType() === 1,
	)
	feedbacks['transition_wipe_active'] = boolFeedback(
		'transition_wipe_active',
		'Transition WIPE Selected',
		'Highlight when transition type is WIPE',
		() => self.getEffectType() === 3,
	)

	self.setFeedbackDefinitions(feedbacks)
}
