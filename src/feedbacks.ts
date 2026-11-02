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

// Device channels are 0-based: HDMI1-4 = 0-3, MEDIA = 4 (confirmed by testing)
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
 * Unified color scheme (product spec):
 * Default: background #151B24, text #98A3B4
 * Highlight (except PGM1-5): background #1B493A, text #B6F5D3
 * PGM1-5 highlight: background #28181C, text #FFC0BB
 */
const ACTIVE_BG = 0x1b493a
const ACTIVE_COLOR = 0xb6f5d3
const PGM_ACTIVE_BG = 0xb71f16
const PGM_ACTIVE_COLOR = 0xffc0bb

/** Builds a simple boolean highlight feedback (uses the unified highlight colors by default) */
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
			// currentPgm/currentPvw start at -1 (unknown); only alert once both are known (>= 0)
			return self.getCurrentPgm() === self.getCurrentPvw() && self.getCurrentPgm() >= 0
		},
	}

	// ---- Phase 1: boolean feature-state highlights ----

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

	// Green/blue screen mutually exclusive highlight (keyInfo.chromaInfo.color judged by RGB; falls back to the last sent value when indistinguishable)
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

	// AFV channels 1-5 highlighted individually (HDMI1-4 + MEDIA)
	for (let ch = 0; ch < 5; ch++) {
		const channel = ch
		feedbacks[`afv_${channel + 1}_active`] = boolFeedback(
			`afv_${channel + 1}_active`,
			`AFV ${channel + 1} Active`,
			`Highlight when AFV is enabled for ${channel < 4 ? `HDMI${channel + 1}` : 'MEDIA'}`,
			() => self.getAfvState(channel),
		)
	}

	// Current scene single-select highlight
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

	// Layer A/B single-select highlight
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

	// Streams 1-4 highlighted individually (state re-synced via 0xB1 0x58 streamInfo)
	for (let i = 0; i < 4; i++) {
		const index = i
		feedbacks[`stream_${index + 1}_active`] = boolFeedback(
			`stream_${index + 1}_active`,
			`Stream ${index + 1} Active`,
			`Highlight when stream ${index + 1} is pushing`,
			() => self.getStreamPush(index),
		)
	}

	// Recording highlight (state re-synced via 0xB1 0x58 recordInfo)
	feedbacks['record_active'] = boolFeedback(
		'record_active',
		'Recording Active',
		'Highlight when recording is in progress',
		() => self.getRecordEnabled(),
	)

	// No USB disk warning (briefly shown when starting a recording is blocked)
	feedbacks['record_no_disk'] = boolFeedback(
		'record_no_disk',
		'Recording Warn: No Disk',
		'Shows NO DISK warning when a record start was blocked by missing USB disk',
		() => self.isRecordWarn(),
		0xffff00,
		0x000000,
	)

	// Empty stream address warning (briefly shown when a stream start is not confirmed by b158)
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

	// Momentary action flash highlight
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

	// FTB highlight (state refreshed via the 13.9 read / 0xB1 0x58 transInfo.ftbEnable)
	feedbacks['ftb_active'] = boolFeedback('ftb_active', 'FTB Active', 'Highlight when fade to black is active', () =>
		self.getFtbEnabled(),
	)

	// Transition type single-select highlight (0=MIX, 1=DIP, 3=WIPE, refreshed via the 13.2 read / device reports)
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
