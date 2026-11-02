import { InstanceBase, InstanceStatus, type SomeCompanionConfigField } from '@companion-module/base'
import * as dgram from 'dgram'
import { GetConfigFields, type ModuleConfig } from './config.js'
import { UpdateActions, type ActionsSchema } from './actions.js'
import { UpdateFeedbacks, type FeedbacksSchema } from './feedbacks.js'
import { UpdatePresets } from './presets.js'
import { UpgradeScripts } from './upgrades.js'
import { UpdateVariableDefinitions, type VariablesSchema } from './variables.js'

export type ModuleSchema = {
	config: ModuleConfig
	secrets: undefined
	actions: ActionsSchema
	feedbacks: FeedbacksSchema
	variables: VariablesSchema
}

export class FeelworldL3Instance extends InstanceBase<ModuleSchema> {
	private socket: dgram.Socket | null = null
	private config: ModuleConfig = {
		host: '192.168.1.100',
		port: 39187,
	}
	/** -1 = not yet known (before the first state sync); valid range 0-4 */
	private currentPgm: number = -1
	private currentPvw: number = -1
	private currentBackground: number = 1
	private backgroundQueryResolvers: Array<(index: number) => void> = []
	/** Stream toggles, index 0-3 = STREAM1-4 (protocol 25.5 / 0xB1 0x58 streamInfo) */
	private streamPushStates: boolean[] = [false, false, false, false]
	/** Deadline for the empty-stream-address warning (when a stream start is not confirmed by b158), index 0-3 */
	private streamWarnUntil: number[] = [0, 0, 0, 0]
	/** Waiters for the b158 confirmation of a stream start, index 0-3 */
	private streamConfirmWaiters: Record<number, Array<(ok: boolean) => void>> = {}
	/** Recording toggle (protocol 26.2 / 0xB1 0x58 recordInfo) */
	private recordEnabled: boolean = false
	/** Whether a USB disk is present (null = unknown; inferred from the 0x61 0x09 reply / recordInfo.diskSpace) */
	private udiskExists: boolean | null = null
	private udiskResolvers: Array<(ok: boolean) => void> = []
	/** Deadline for the no-USB-disk warning display */
	private recordWarnUntil: number = 0
	/** Receive buffer: used to reassemble variable-length JSON frames */
	private rxBuffer: Buffer = Buffer.alloc(0)
	/** Pending startup state-sync timers (cleared on destroy / config change / re-sync) */
	private syncTimers: NodeJS.Timeout[] = []
	/** Set once the device answers the startup queries */
	private deviceReplied: boolean = false
	/** Timer that flags ConnectionFailure when the device never answers the startup queries */
	private connectTimeoutTimer: NodeJS.Timeout | null = null

	// ---- Phase 1: boolean feature-state caches (refreshed by device replies / reports) ----
	/** PIP on/off (protocol 6.5/6.6) */
	private pipEnabled: boolean = false
	/** Key mode: 0=off 1=chroma 2=luma (protocol 10.3) */
	private keyMode: number = 0
	/** Chroma key color (keyInfo.chromaInfo.color, used to tell green/blue screen apart) */
	private chromaColor: string = ''
	/** Chroma key range lower bound (10.6 reply min / keyInfo.chromaInfo.minValue, used to tell green/blue apart) */
	private chromaMin: number | null = null
	/** The chroma choice this module last sent (fallback when reported colors are indistinguishable) */
	private chromaHint: '' | 'green' | 'blue' = ''
	/** LOGO on/off (tested: Preview/Program make no difference, DAT2 0x00/0x01 equivalent, always 0x00) */
	private logoEnabled: boolean = false
	/** Background layer on/off (protocol 8.1/8.3 DAT2) */
	private backgroundEnabled: boolean = false
	/** Output mute: PVW (monitor, DAT2=0x00) / PGM (DAT2=0x01), protocol 15.1/15.2 */
	private pvwMute: boolean = false
	private pgmMute: boolean = false
	/** AFV toggles, index 0-4 = HDMI1-4 + MEDIA (protocol 14.1) */
	private afvStates: boolean[] = [false, false, false, false, false]
	/** Output volume 0-100 (protocol 15.3/15.4; 0=monitor(PVW), 1=PGM) */
	private pvwVolume: number = 0
	private pgmVolume: number = 0
	private pvwVolumeResolvers: Array<(volume: number) => void> = []
	private pgmVolumeResolvers: Array<(volume: number) => void> = []
	/** Current scene number: 0=none selected, 1-8 (protocol 12.1/12.2) */
	private currentScene: number = 0
	/** Currently selected layer: 0=LayerB, 1=LayerA (protocol 6.8/6.9) */
	private layerSel: number = 0
	/** Current effect type enum: 0=MIX, 1=DIP, 3=WIPE (protocol 13.2 + product confirmation) */
	private effectType: number = -1
	/** FTB state (protocol 13.9 / 0xB1 0x58 transInfo.ftbEnable) */
	private ftbEnabled: boolean = false
	/** Momentary action flash: actionId → timestamp when the flash turns off */
	private flashUntil: Record<string, number> = {}

	constructor(internal: unknown) {
		super(internal)
	}

	async init(config: ModuleConfig): Promise<void> {
		this.config = config
		UpdateActions(this)
		UpdateFeedbacks(this)
		UpdatePresets(this)
		UpdateVariableDefinitions(this)
		this.updateVariableValues()
		this.updateStatus(InstanceStatus.Disconnected)
		await this.connect()
	}

	async destroy(): Promise<void> {
		this.clearJsonWait()
		this.clearSyncTimers()
		this.clearConnectTimeout()
		if (this.socket) {
			this.socket.close()
			this.socket = null
		}
	}

	async configUpdated(config: ModuleConfig): Promise<void> {
		this.config = config
		this.clearSyncTimers()
		this.clearConnectTimeout()
		if (this.socket) {
			this.socket.close()
			this.socket = null
		}
		await this.connect()
	}

	private async connect(): Promise<void> {
		try {
			this.deviceReplied = false
			this.socket = dgram.createSocket('udp4')

			this.socket.on('error', (err) => {
				this.log('error', `Socket error: ${err.message}`)
				this.updateStatus(InstanceStatus.ConnectionFailure)
			})

			this.socket.on('message', (msg, rinfo) => {
				if (!this.deviceReplied && rinfo.address === this.config.host) {
					this.deviceReplied = true
					this.clearConnectTimeout()
					this.updateStatus(InstanceStatus.Ok)
				}
				this.handleResponse(msg)
			})

			this.socket.on('listening', () => {
				// Local bind succeeded — the device is only considered reachable once it answers the startup queries
				this.updateStatus(InstanceStatus.Connecting)
				this.log('info', `UDP socket listening; waiting for replies from ${this.config.host}:${this.config.port}`)
				this.connectTimeoutTimer = setTimeout(() => {
					if (!this.deviceReplied) {
						this.updateStatus(InstanceStatus.ConnectionFailure, 'No response from device')
					}
				}, 5000)
				this.syncAllStates()
			})

			this.socket.bind()
		} catch (err) {
			this.log('error', `Connection failed: ${err}`)
			this.updateStatus(InstanceStatus.ConnectionFailure)
		}
	}

	private clearConnectTimeout(): void {
		if (this.connectTimeoutTimer) {
			clearTimeout(this.connectTimeoutTimer)
			this.connectTimeoutTimer = null
		}
	}

	/** Waits for a JSON data block to complete (timeout recovery when a fragment is lost) */
	private jsonWait: { total: number; head: string } | null = null
	private jsonWaitTimer: NodeJS.Timeout | null = null

	private handleResponse(msg: Buffer): void {
		this.log('debug', `Received: ${msg.toString('utf8')}`)
		this.rxBuffer = Buffer.concat([this.rxBuffer, msg])
		this.parseRxBuffer()
	}

	/**
	 * Parses the receive buffer per the protocol:
	 * - 1.1: fixed frames are 19 chars, CHKSUM = (ADDR+SN+CMD+DAT1..DAT4) & 0xFF; on mismatch, resync byte-by-byte as dirty data
	 * - 1.5: 0xB0/0xB1 with DAT1~4 all 0xFF is the "unsupported command" error reply, no data block; consume as a fixed frame
	 * - 1.3: normal 0xB0/0xB1 frames carry the data-block length in DAT3/DAT4 (LSB/MSB, including the trailing checksum byte)
	 * - Falls back to brace matching when the length field is abnormal; drops the header if the block never arrives
	 */
	private parseRxBuffer(): void {
		for (;;) {
			if (this.rxBuffer.length < 19) {
				break
			}
			if (this.rxBuffer[0] !== 0x28 /* '(' */) {
				// Drop dirty data until resynchronized at a frame header
				this.rxBuffer = this.rxBuffer.subarray(1)
				continue
			}

			const head = this.rxBuffer.toString('ascii', 0, 19)
			const addr = parseInt(head.substring(2, 4), 16)
			const sn = parseInt(head.substring(4, 6), 16)
			const cmd = parseInt(head.substring(6, 8), 16)
			const dat1 = parseInt(head.substring(8, 10), 16)
			const dat2 = parseInt(head.substring(10, 12), 16)
			const dat3 = parseInt(head.substring(12, 14), 16)
			const dat4 = parseInt(head.substring(14, 16), 16)
			const chksum = parseInt(head.substring(16, 18), 16)
			if (isNaN(cmd) || isNaN(dat1) || isNaN(dat2) || isNaN(dat3) || isNaN(dat4) || isNaN(chksum)) {
				this.rxBuffer = this.rxBuffer.subarray(1)
				continue
			}

			// Protocol 1.1: checksum mismatch → corrupted frame, drop byte-by-byte until resync
			const expectedChksum = (addr + sn + cmd + dat1 + dat2 + dat3 + dat4) & 0xff
			if (chksum !== expectedChksum) {
				this.log('debug', `Checksum mismatch, resync: ${head}`)
				this.rxBuffer = this.rxBuffer.subarray(1)
				continue
			}

			if (cmd === 0xb0 || cmd === 0xb1) {
				// Protocol 1.5: unsupported command / error reply, DAT1~4 all 0xFF, no data block
				// (the device returns this frame for the active 0xB1 0x58 query; it used to stall the brace wait)
				if (dat1 === 0xff && dat2 === 0xff && dat3 === 0xff && dat4 === 0xff) {
					this.rxBuffer = this.rxBuffer.subarray(19)
					this.log('debug', `Device error/unsupported response, CMD=0x${cmd.toString(16).padStart(2, '0')}`)
					continue
				}

				// Protocol 1.3: DAT3/DAT4 = data block length (LSB/MSB, including the trailing checksum byte)
				const dataLen = dat3 | (dat4 << 8)
				if (dataLen >= 2 && dataLen <= 8192) {
					const total = 19 + dataLen
					if (this.rxBuffer.length < total) {
						// Data block not complete yet, wait for the next UDP packet
						this.waitJsonData(total, head)
						break
					}
					const dataBlock = this.rxBuffer.subarray(19, total)
					// Protocol 1.3 calls the last block byte a "data sum checksum", but on tested firmware (218+) it is always
					// the constant character 'a' (0x61), matching neither sum nor XOR of the data (doc example frames differ too),
					// so it is not strictly validated; JSON is extracted by the lenient parser up to the last '}' in the block
					const trailer = dataBlock[dataBlock.length - 1]
					if (trailer !== 0x61) {
						this.log('debug', `JSON data block trailer 0x${trailer.toString(16)} (expected constant 0x61)`)
					}
					this.rxBuffer = this.rxBuffer.subarray(total)
					this.clearJsonWait()
					this.handleJsonFrame(cmd, Buffer.from(dataBlock.subarray(0, dataBlock.length - 1)), trailer)
					continue
				}

				// Abnormal length field (legacy firmware issue): fall back to brace matching
				const open = this.rxBuffer.indexOf(0x7b /* '{' */)
				if (open === -1) {
					this.waitJsonData(this.rxBuffer.length + 1, head)
					break
				}
				// Find the '}' matching the first '{' (skipping braces inside strings)
				let depth = 0
				let end = -1
				let inStr = false
				for (let i = open; i < this.rxBuffer.length; i++) {
					const c = this.rxBuffer[i]
					if (inStr) {
						if (c === 0x22 /* '"' */ && this.rxBuffer[i - 1] !== 0x5c /* '\' */) inStr = false
					} else if (c === 0x22) {
						inStr = true
					} else if (c === 0x7b) {
						depth++
					} else if (c === 0x7d /* '}' */) {
						depth--
						if (depth === 0) {
							end = i
							break
						}
					}
				}
				if (end === -1) {
					this.waitJsonData(this.rxBuffer.length + 1, head)
					break // JSON incomplete, wait for further fragments
				}
				const jsonBytes = Buffer.from(this.rxBuffer.subarray(open, end + 1))
				let consumed = end + 1
				// Skip the trailing checksum byte (if present and not the next frame header '(')
				if (consumed < this.rxBuffer.length && this.rxBuffer[consumed] !== 0x28) {
					consumed++
				}
				this.rxBuffer = this.rxBuffer.subarray(consumed)
				this.clearJsonWait()
				this.handleJsonFrame(cmd, jsonBytes, 0)
				continue
			}

			// 19-char fixed frame
			const frame = head
			this.rxBuffer = this.rxBuffer.subarray(19)
			this.handleFixedFrame(frame)
		}
	}

	/** Waits for the JSON data block; if still incomplete after 500ms the fragment is considered lost and the header is dropped to unblock the queue */
	private waitJsonData(total: number, head: string): void {
		if (this.jsonWaitTimer) {
			return
		}
		if (this.rxBuffer.length > 65536) {
			this.rxBuffer = Buffer.alloc(0)
			return
		}
		this.jsonWait = { total, head }
		this.jsonWaitTimer = setTimeout(() => {
			this.jsonWaitTimer = null
			const waiting = this.jsonWait
			this.jsonWait = null
			if (!waiting) {
				return
			}
			// Buffer head is still the same frame and the block is still incomplete → fragment lost, drop the header and resync
			const stillStuck =
				this.rxBuffer.length >= 19 &&
				this.rxBuffer.toString('ascii', 0, 19) === waiting.head &&
				this.rxBuffer.length < waiting.total
			if (stillStuck) {
				this.log('debug', 'JSON data block incomplete after 500ms, drop header and resync')
				this.rxBuffer = this.rxBuffer.subarray(19)
			}
			this.parseRxBuffer()
		}, 500)
	}

	private clearJsonWait(): void {
		if (this.jsonWaitTimer) {
			clearTimeout(this.jsonWaitTimer)
			this.jsonWaitTimer = null
		}
		this.jsonWait = null
	}

	/** Parses a variable-length JSON frame (0xB0/0xB1) and applies it to the state caches */
	private handleJsonFrame(cmd: number, jsonBytes: Buffer, _chk: number): void {
		const jsonStr = jsonBytes.toString('utf8')
		const parsed = this.tryParseLooseJson(jsonStr)
		if (parsed === null) {
			this.log('error', `Failed to parse JSON frame (CMD=0x${cmd.toString(16).padStart(2, '0')}): ${jsonStr}`)
			return
		}
		// Handles both formats: the {data:{...},...} wrapper (seen on .132 firmware) and fields at the root
		this.applyJsonReport(parsed?.data ?? parsed)
	}

	/**
	 * Lenient JSON parsing: JSON reports from tested firmware (L3Pro) are not strictly valid:
	 * - unquoted keys (e.g. data:, dev name:, dev uuid:, with spaces in key names)
	 * - trailing checksum bytes (e.g. }a)
	 * Tries in order: trim trailing residue → parse as-is → parse after repairing unquoted keys.
	 */
	private tryParseLooseJson(jsonStr: string): any | null {
		const end = jsonStr.lastIndexOf('}')
		if (end === -1) {
			return null
		}
		const trimmed = jsonStr.slice(0, end + 1)
		const candidates = [trimmed]
		// Repair unquoted keys after '{' or ',' (key positions only; quoted string values are untouched)
		const repaired = trimmed.replace(/([{,])\s*([A-Za-z_][A-Za-z0-9_ \-]*)\s*:/g, '$1"$2":')
		if (repaired !== trimmed) {
			candidates.push(repaired)
		}
		for (const candidate of candidates) {
			try {
				return JSON.parse(candidate)
			} catch {
				// Try the next candidate
			}
		}
		return null
	}

	/**
	 * Applies a 0xB1 0x58 status report (device push / query reply).
	 * Confirmed: the id==1 entry in pgmpvwInfo is the main channel; channel numbers are 0-based (HDMI1-4=0-3, MEDIA=4).
	 */
	private applyJsonReport(data: any): void {
		if (!data || typeof data !== 'object') {
			return
		}
		let updated = false

		// PGM/PVW
		const pgmpvw = data.pgmpvwInfo
		if (pgmpvw && typeof pgmpvw === 'object') {
			const pick = (list: any): number | null => {
				if (!Array.isArray(list) || list.length === 0) return null
				const main = list.find((e: any) => e && e.id === 1) ?? list[0]
				return typeof main?.channel === 'number' ? main.channel : null
			}
			const pgm = pick(pgmpvw.pgmInfo)
			const pvw = pick(pgmpvw.pvwInfo)
			if (pgm !== null) this.currentPgm = pgm
			if (pvw !== null) this.currentPvw = pvw
			this.updateVariableValues()
			updated = true
		}

		// Streams 1-4 (tested: urlInfo ids start at 1: id=1 is STREAM1 ... id=4 is STREAM4;
		// id=0 is an entry with another meaning (e.g. the current stream URL), ignored)
		const stream = data.streamInfo
		if (stream && Array.isArray(stream.urlInfo)) {
			stream.urlInfo.forEach((u: any, i: number) => {
				const idx = typeof u?.id === 'number' ? u.id - 1 : i
				if (idx >= 0 && idx < 4 && u && typeof u.isPush === 'boolean') {
					this.streamPushStates[idx] = u.isPush
				}
			})
			// A streamInfo push is treated as acceptance of the stream-start command:
			// tested: with an empty address the device does not reply at all; with a non-empty address it always replies with b158,
			for (const key of Object.keys(this.streamConfirmWaiters)) {
				const idx = Number(key)
				const arr = this.streamConfirmWaiters[idx]
				if (arr && arr.length) {
					this.streamConfirmWaiters[idx] = []
					arr.forEach((w) => w(true))
				}
			}
			updated = true
		}

		// Recording
		const record = data.recordInfo
		if (record && typeof record === 'object') {
			if (typeof record.enable === 'boolean') {
				this.recordEnabled = record.enable
				updated = true
			}
			// USB disk presence heuristic (diskSpace > 0 counts as present)
			if (typeof record.diskSpace === 'number') {
				this.udiskExists = record.diskSpace > 0
			}
		}

		// Background
		const bg = data.bgInfo
		if (bg && typeof bg === 'object') {
			if (typeof bg.enable === 'boolean') this.backgroundEnabled = bg.enable
			if (typeof bg.selIndex === 'number') this.currentBackground = bg.selIndex
			updated = true
		}

		// Keying: enable + mode (1=chroma 2=luma)
		const key = data.keyInfo
		if (key && typeof key === 'object' && typeof key.enable === 'boolean') {
			this.keyMode = key.enable ? (key.mode === 2 ? 2 : 1) : 0
			updated = true
			// Chroma color/range (used for the green/blue mutually exclusive highlight)
			const chroma = key.chromaInfo
			if (chroma && typeof chroma === 'object') {
				if (typeof chroma.color === 'string' && chroma.color) {
					this.chromaColor = chroma.color
				}
				if (typeof chroma.minValue === 'number') {
					this.chromaMin = chroma.minValue
				}
			}
		}

		// PIP
		const pip = data.pipInfo
		if (pip && typeof pip === 'object' && typeof pip.enable === 'boolean') {
			this.pipEnabled = pip.enable
			updated = true
		}

		// Scene
		const scene = data.sceneInfo
		if (scene && typeof scene === 'object' && typeof scene.selIndex === 'number') {
			this.currentScene = scene.selIndex >= 1 && scene.selIndex <= 8 ? scene.selIndex : 0
			updated = true
		}

		// Effect type
		const effect = data.effectInfo
		if (effect && typeof effect === 'object' && typeof effect.mode === 'number') {
			this.effectType = effect.mode
			updated = true
		}

		// FTB (transInfo.ftbEnable)
		const trans = data.transInfo
		if (trans && typeof trans === 'object' && typeof trans.ftbEnable === 'boolean') {
			this.ftbEnabled = trans.ftbEnable
			updated = true
		}

		// AFV: audioInfo.inputInfo {id, afv}, id 1-5 = HDMI1-4 + MEDIA
		const audio = data.audioInfo
		if (audio && Array.isArray(audio.inputInfo)) {
			audio.inputInfo.forEach((input: any) => {
				if (input && typeof input.id === 'number' && input.id >= 1 && input.id <= 5 && typeof input.afv === 'boolean') {
					this.afvStates[input.id - 1] = input.afv
				}
			})
			updated = true
		}

		// LOGO (tested: Preview/Program make no difference, logoInfo.enable is the switch state)
		const logo = data.logoInfo
		if (logo && typeof logo === 'object' && typeof logo.enable === 'boolean') {
			this.logoEnabled = logo.enable
			updated = true
		}

		// Chroma key params (protocol 10.6 reply 0xB1 0x24 0x05; the 0xB1 0x58 push on this firmware has the same shape)
		// color can be an empty string, in which case green/blue is decided by the min range (10.4 table: green=560-1232, blue=1600-1984)
		if (typeof data.min === 'number' && typeof data.sat === 'number' && data.min > 0) {
			this.chromaMin = data.min
			if (typeof data.color === 'string' && data.color) {
				this.chromaColor = data.color
			}
			updated = true
		}

		if (updated) {
			this.checkAllFeedbacks()
		}
	}

	private handleFixedFrame(frame: string): void {
		const cmd = parseInt(frame.substring(6, 8), 16)
		const dat1 = parseInt(frame.substring(8, 10), 16)
		const dat2 = parseInt(frame.substring(10, 12), 16)
		const dat3 = parseInt(frame.substring(12, 14), 16)
		const dat4 = parseInt(frame.substring(14, 16), 16)
		let updated = false

		// Source read reply: CMD=0x20, DAT1=0x0d PGM / 0x0e PVW, DAT2=source index 0-4
		// (HDMI1-4=0-3, MEDIA=4, 0-based matching panel keys 1-5; same numbering as the pgmpvwInfo JSON channel)
		if (cmd === 0x20 && (dat1 === 0x0d || dat1 === 0x0e)) {
			if (dat1 === 0x0d) {
				this.currentPgm = dat2
			} else {
				this.currentPvw = dat2
			}
			this.updateVariableValues()
			updated = true
		}

		// Protocol 20.9 (doc table): reply CMD=0x54 DAT1=0x0A, DAT2=PGM, DAT3=PVW
		// (no reply seen on this firmware; kept for compatibility)
		if (cmd === 0x54 && dat1 === 0x0a) {
			this.currentPgm = dat2
			this.currentPvw = dat3
			this.updateVariableValues()
			updated = true
		}

		// Protocol 8.3: background info read, reply CMD=0x22 DAT1=0x03, DAT2=switch, DAT3=selected image index
		if (cmd === 0x22 && dat1 === 0x03) {
			this.backgroundEnabled = dat2 === 1
			this.currentBackground = dat3
			for (const resolve of this.backgroundQueryResolvers) {
				resolve(dat3)
			}
			this.backgroundQueryResolvers = []
			updated = true
		}

		// Protocol 6.6: PIP switch read, reply CMD=0x20 DAT1=0x05, DAT2=0 off/1 on
		if (cmd === 0x20 && dat1 === 0x05) {
			this.pipEnabled = dat2 === 1
			updated = true
		}

		// Protocol 6.9: selected layer index read, reply CMD=0x20 DAT1=0x09, DAT2=0 LayerB / 1 LayerA
		if (cmd === 0x20 && dat1 === 0x09) {
			this.layerSel = dat2 === 1 ? 1 : 0
			updated = true
		}

		// Protocol 10.3: key mode read, reply CMD=0x24 DAT1=0x03, DAT2=0 off/1 chroma/2 luma
		if (cmd === 0x24 && dat1 === 0x03) {
			this.keyMode = dat2
			updated = true
		}

		// Protocol 9.4: LOGO switch state, DAT2 fixed 0x00 (tested: Preview/Program identical), DAT3=0 off/1 on
		if (cmd === 0x23 && dat1 === 0x03 && dat2 === 0x00) {
			this.logoEnabled = dat3 === 1
			updated = true
		}

		// Protocol 15.2: output MUTE read, reply CMD=0x41 DAT1=0x01, DAT2=bus(0 monitor/1 PGM), DAT3=0 off/1 on
		if (cmd === 0x41 && dat1 === 0x01) {
			if (dat2 === 0x00) {
				this.pvwMute = dat3 === 1
			} else if (dat2 === 0x01) {
				this.pgmMute = dat3 === 1
			}
			updated = true
		}

		// Protocol 15.4: output volume read, reply CMD=0x41 DAT1=0x03, DAT2=bus(0 monitor/1 PGM), DAT3=volume 0-100
		if (cmd === 0x41 && dat1 === 0x03) {
			if (dat2 === 0x00) {
				this.pvwVolume = dat3
				for (const resolve of this.pvwVolumeResolvers) {
					resolve(dat3)
				}
				this.pvwVolumeResolvers = []
			} else if (dat2 === 0x01) {
				this.pgmVolume = dat3
				for (const resolve of this.pgmVolumeResolvers) {
					resolve(dat3)
				}
				this.pgmVolumeResolvers = []
			}
			updated = true
		}

		// Protocol 14.1: AFV switch, reply per product confirmation: DAT3=channel(0-4), DAT4=0 off/1 on (assumption; adjust if hardware differs)
		if (cmd === 0x40 && dat1 === 0x01 && dat3 >= 0 && dat3 <= 4) {
			this.afvStates[dat3] = dat4 === 1
			updated = true
		}

		// Protocol 12.2: current scene index read, DAT2 in 1-8 valid, otherwise treated as no scene selected
		if (cmd === 0x30 && dat1 === 0x01) {
			this.currentScene = dat2 >= 1 && dat2 <= 8 ? dat2 : 0
			updated = true
		}

		// Protocol 13.2: effect mode read, DAT2=current effect enum (0=MIX, 1=DIP, 3=WIPE)
		if (cmd === 0x31 && dat1 === 0x01) {
			this.effectType = dat2
			updated = true
		}

		// FTB state read (per the 218+ doc table): request CMD=0x31 DAT1=0x09,
		// reply DAT1=0x09, DAT2=0x00 on / 0x01 off (table reply CMD=0x32; 0x31 same-family echo also accepted)
		if ((cmd === 0x31 || cmd === 0x32) && dat1 === 0x09) {
			this.ftbEnabled = dat2 === 0x00
			updated = true
		}

		// Protocol 26.8: USB disk presence, reply CMD=0x61 DAT1=0x09, DAT2=0x00 absent / 0x01 present
		if (cmd === 0x61 && dat1 === 0x09) {
			const exists = dat2 === 0x01
			this.udiskExists = exists
			for (const resolve of this.udiskResolvers) {
				resolve(exists)
			}
			this.udiskResolvers = []
			updated = true
		}

		if (updated) {
			this.checkAllFeedbacks()
		}
	}

	/**
	 * Initial state sync after connecting: sends the read command for each feature in turn (100ms apart to avoid flooding).
	 * Device replies and later reports refresh the corresponding state caches.
	 */
	private syncAllStates(): void {
		this.clearSyncTimers()
		const queries: Array<() => Promise<void>> = [
			// Note: the 0xB1 0x58 full-status query was removed — the firmware does not answer it with JSON; state relies on device reports
			() => this.sendCommand(0x20, 0x0d, 0x00, 0x00, 0x00), // Read current PGM source
			() => this.sendCommand(0x20, 0x0e, 0x00, 0x00, 0x00), // Read current PVW source
			() => this.sendCommand(0x20, 0x05, 0x00, 0x00, 0x00), // PIP switch
			() => this.sendCommand(0x20, 0x09, 0x00, 0x00, 0x00), // Layer A/B
			() => this.sendCommand(0x24, 0x03, 0x00, 0x00, 0x00), // Key mode
			() => this.sendCommand(0xb1, 0x24, 0x05, 0x00, 0x00), // Chroma key params (protocol 10.6 values)
			() => this.sendCommand(0xb1, 0xa5, 0x03, 0x00, 0x00), // Chroma key params (legacy 10.6 example values, some firmwares only accept these)
			() => this.sendCommand(0x23, 0x03, 0x00, 0x00, 0x00), // LOGO switch
			() => this.sendCommand(0x22, 0x03, 0x00, 0x00, 0x00), // Background
			() => this.sendCommand(0x41, 0x01, 0x00, 0x00, 0x00), // Monitor (PVW) MUTE
			() => this.sendCommand(0x41, 0x01, 0x01, 0x00, 0x00), // PGM MUTE
			() => this.sendCommand(0x41, 0x03, 0x00, 0x00, 0x00), // Monitor (PVW) volume
			() => this.sendCommand(0x41, 0x03, 0x01, 0x00, 0x00), // PGM volume
			() => this.sendCommand(0x30, 0x01, 0x00, 0x00, 0x00), // Current scene
			() => this.sendCommand(0x31, 0x01, 0x00, 0x00, 0x00), // Effect type
			() => this.sendCommand(0x31, 0x09, 0x00, 0x00, 0x00), // FTB state (218+ doc table; legacy example frame 0x38 is rejected by the firmware)
			// AFV channels 1-5 read one by one (0x40 0x01, DAT2=0x01 read, DAT3=channel)
			...this.afvStates.map((_, ch) => () => this.sendCommand(0x40, 0x01, 0x01, ch, 0x00)),
		]
		queries.forEach((query, i) => {
			this.syncTimers.push(
				setTimeout(() => {
					query().catch(() => {})
				}, i * 100),
			)
		})
	}

	private clearSyncTimers(): void {
		for (const t of this.syncTimers) {
			clearTimeout(t)
		}
		this.syncTimers = []
	}

	private updateVariableValues(): void {
		// -1 = not yet known; hide the variables until the first state sync
		this.setVariableValues({
			current_pgm: this.currentPgm >= 0 ? this.currentPgm : undefined,
			current_pvw: this.currentPvw >= 0 ? this.currentPvw : undefined,
		})
	}

	private buildCommand(cmd: number, dat1: number, dat2: number, dat3: number, dat4: number): string {
		const addr = 0x00
		const sn = 0x00
		const checksum = (addr + sn + cmd + dat1 + dat2 + dat3 + dat4) & 0xff
		return `(R${addr.toString(16).padStart(2, '0')}${sn.toString(16).padStart(2, '0')}${cmd.toString(16).padStart(2, '0')}${dat1.toString(16).padStart(2, '0')}${dat2.toString(16).padStart(2, '0')}${dat3.toString(16).padStart(2, '0')}${dat4.toString(16).padStart(2, '0')}${checksum.toString(16).padStart(2, '0')})`
	}

	private sendBuffer(buffer: Buffer, logValue: string): Promise<void> {
		if (!this.socket) {
			this.log('error', 'Socket not connected')
			return Promise.resolve()
		}

		this.log('debug', `Sending: ${logValue}`)

		return new Promise((resolve) => {
			this.socket!.send(buffer, this.config.port, this.config.host, (err) => {
				if (err) {
					this.log('error', `Send error: ${err.message}`)
				}
				resolve()
			})
		})
	}

	async sendCommand(cmd: number, dat1: number, dat2: number, dat3: number, dat4: number): Promise<void> {
		if (!this.socket) {
			this.log('error', 'Socket not connected')
			return
		}

		const command = this.buildCommand(cmd, dat1, dat2, dat3, dat4)
		this.log('debug', `Sending: ${command}`)

		return new Promise((resolve) => {
			this.socket!.send(command, this.config.port, this.config.host, (err) => {
				if (err) {
					this.log('error', `Send error: ${err.message}`)
				}
				resolve()
			})
		})
	}

	async sendJsonCommand(cmd: number, dat1: number, dat2: number, payload: Record<string, unknown>): Promise<void> {
		const json = JSON.stringify(payload)
		const jsonBuffer = Buffer.from(json, 'utf8')
		const dataLength = jsonBuffer.length + 1
		const dat3 = dataLength & 0xff
		const dat4 = (dataLength >> 8) & 0xff
		const header = this.buildCommand(cmd, dat1, dat2, dat3, dat4)
		const dataChecksum = jsonBuffer.reduce((sum, byte) => (sum + byte) & 0xff, 0)
		const buffer = Buffer.concat([Buffer.from(header, 'ascii'), jsonBuffer, Buffer.from([dataChecksum])])

		await this.sendBuffer(buffer, `${header}${json}[${dataChecksum.toString(16).padStart(2, '0')}]`)
	}

	async sendKeyPress(keyCode: number): Promise<void> {
		// Protocol 19.1: single key click CMD=0x53 DAT1=0x01, DAT3=0x01 press / 0x02 release
		await this.sendCommand(0x53, 0x01, keyCode, 0x01, 0x00)
		await new Promise((r) => setTimeout(r, 50))
		await this.sendCommand(0x53, 0x01, keyCode, 0x02, 0x00)
	}

	async sendAiVoiceKeyPress(functionCode: number): Promise<void> {
		await this.sendCommand(0x8a, 0x01, functionCode, 0x01, 0x00)
		await new Promise((r) => setTimeout(r, 50))
		await this.sendCommand(0x8a, 0x01, functionCode, 0x02, 0x00)
	}

	/**
	 * Stream toggle (protocol 25.5: 0xB0 0x60 0x04, index 0-3 = STREAM1-4).
	 * Start is confirmed by "received a 0xB1 0x58 streamInfo push" (tested: its isPush lags one beat and is unreliable);
	 * with an empty stream address the device returns no b158; on timeout it is handled as the "empty address" warning.
	 */
	async toggleStream(index: number): Promise<void> {
		if (this.streamPushStates[index]) {
			this.streamPushStates[index] = false
			this.checkAllFeedbacks()
			await this.sendJsonCommand(0xb0, 0x60, 0x04, { index, ispush: false, language: 1 })
			return
		}
		// Send the stream-start command directly (0xB0 0x60 0x04) and wait for the b158 confirmation (1.5s).
		// Two timeout causes: 1) empty stream address (device stays silent) 2) desync after module reload (already streaming, device silently ignores ispush:true).
		// Sending an ispush:false reset first and retrying self-heals case 2; if still unconfirmed, show the empty-address warning.
		let confirmed = await this.startStreamAndWaitConfirm(index)
		if (!confirmed) {
			await this.sendJsonCommand(0xb0, 0x60, 0x04, { index, ispush: false, language: 1 }).catch(() => {})
			// Brief pause so the device's stop-command push is not mistaken for the retry confirmation
			await new Promise((r) => setTimeout(r, 200))
			confirmed = await this.startStreamAndWaitConfirm(index)
		}
		if (confirmed) {
			this.streamPushStates[index] = true
		} else {
			this.warnStreamNoAddress(index)
		}
		this.checkAllFeedbacks()
	}

	/** Sends the stream-start command and waits for the b158 confirmation; returns false on timeout/send failure (1.5s) */
	private startStreamAndWaitConfirm(index: number): Promise<boolean> {
		return new Promise((resolve) => {
			const wake = (ok: boolean) => {
				clearTimeout(timer)
				const arr = this.streamConfirmWaiters[index] ?? []
				this.streamConfirmWaiters[index] = arr.filter((w) => w !== wake)
				resolve(ok)
			}
			const timer = setTimeout(() => wake(false), 1500)
			const arr = this.streamConfirmWaiters[index] ?? []
			arr.push(wake)
			this.streamConfirmWaiters[index] = arr
			this.sendJsonCommand(0xb0, 0x60, 0x04, { index, ispush: true, language: 1 }).catch(() => wake(false))
		})
	}

	/** Empty stream address warning: ADDRESS EMPTY feedback on the button + log, for 1s */
	private warnStreamNoAddress(index: number): void {
		this.streamWarnUntil[index] = Date.now() + 1000
		this.checkAllFeedbacks()
		this.log('warn', `Cannot start stream ${index + 1}: address is empty`)
		setTimeout(() => {
			this.streamWarnUntil[index] = 0
			this.checkAllFeedbacks()
		}, 1000)
	}

	isStreamWarn(index: number): boolean {
		return (this.streamWarnUntil[index] ?? 0) > Date.now()
	}

	/**
	 * Queries whether a USB disk is present (protocol 26.8: 0x61 0x09, reply DAT2=0x01 present / 0x00 absent).
	 * Returns true=present / false=absent / null=unknown (timeout or unsupported firmware).
	 */
	private queryUdisk(): Promise<boolean | null> {
		return new Promise((resolve) => {
			const timer = setTimeout(() => {
				this.udiskResolvers = []
				resolve(null)
			}, 1500)

			this.udiskResolvers.push((ok) => {
				clearTimeout(timer)
				resolve(ok)
			})

			this.sendCommand(0x61, 0x09, 0x00, 0x00, 0x00).catch(() => {
				clearTimeout(timer)
				this.udiskResolvers = []
				resolve(null)
			})
		})
	}

	/**
	 * No-USB-disk warning: only the NO DISK feedback on the REC button + log, for 1s.
	 * Do not use updateStatus(Warning): that is the instance-level status and would draw a warning triangle
	 * on every button of this instance; it cannot target a single button.
	 */
	private warnNoDisk(): void {
		this.recordWarnUntil = Date.now() + 1000
		this.checkAllFeedbacks()
		this.log('warn', 'Cannot start recording: no USB disk detected')
		setTimeout(() => {
			this.recordWarnUntil = 0
			this.checkAllFeedbacks()
		}, 1000)
	}

	isRecordWarn(): boolean {
		return this.recordWarnUntil > Date.now()
	}

	/**
	 * Recording toggle (protocol 26.2: 0xB0 0x61 0x01, state re-synced via 0xB1 0x58 recordInfo).
	 * Verifies the USB disk before starting a recording; stopping needs no check.
	 */
	async toggleRecord(): Promise<void> {
		if (this.recordEnabled) {
			this.recordEnabled = false
			this.checkAllFeedbacks()
			await this.sendJsonCommand(0xb0, 0x61, 0x01, { isStart: false })
			return
		}

		const disk = await this.queryUdisk()
		// disk: true=present false=absent null=unknown (timeout/unsupported firmware)
		if (disk === false || (disk === null && this.udiskExists === false)) {
			this.warnNoDisk()
			return
		}
		if (disk === null) {
			this.log('warn', 'USB disk status unknown, trying to start recording anyway')
		}

		this.recordEnabled = true
		this.checkAllFeedbacks()
		await this.sendJsonCommand(0xb0, 0x61, 0x01, { isStart: true })
	}

	// ---------- Phase 1: toggles / volume stepping / setters ----------

	/** PIP on/off toggle (protocol 6.5: 0x20 0x04, DAT2=0 off/1 on) */
	async togglePip(): Promise<void> {
		this.pipEnabled = !this.pipEnabled
		this.checkAllFeedbacks()
		await this.sendCommand(0x20, 0x04, this.pipEnabled ? 0x01 : 0x00, 0x00, 0x00)
	}

	/** Key on/off toggle (protocol 10.1: 0x24 0x00; off↔chroma mode) */
	async toggleKey(): Promise<void> {
		this.keyMode = this.keyMode === 0 ? 1 : 0
		this.checkAllFeedbacks()
		await this.sendCommand(0x24, 0x00, this.keyMode === 0 ? 0x00 : 0x01, 0x00, 0x00)
	}

	/** LOGO on/off toggle (protocol 9.3: 0x23 0x02, DAT2 fixed 0x00, DAT3=0 off/1 on) */
	async toggleLogo(): Promise<void> {
		this.logoEnabled = !this.logoEnabled
		this.checkAllFeedbacks()
		await this.sendCommand(0x23, 0x02, 0x00, this.logoEnabled ? 0x01 : 0x00, 0x00)
		// The device does not push LOGO state; read back after writing to re-sync
		setTimeout(() => {
			this.sendCommand(0x23, 0x03, 0x00, 0x00, 0x00).catch(() => {})
		}, 100)
	}

	/** Background layer on/off toggle (protocol 8.1: 0x22 0x00, DAT2=0 off/1 on) */
	async toggleBackgroundPower(): Promise<void> {
		this.backgroundEnabled = !this.backgroundEnabled
		this.checkAllFeedbacks()
		await this.sendCommand(0x22, 0x00, this.backgroundEnabled ? 0x01 : 0x00, 0x00, 0x00)
	}

	/** Output mute toggle (protocol 15.1: 0x41 0x00, DAT2=0 monitor(PVW)/1 PGM, DAT3=0 off/1 on) */
	async toggleMute(bus: number): Promise<void> {
		if (bus === 0) {
			this.pvwMute = !this.pvwMute
		} else {
			this.pgmMute = !this.pgmMute
		}
		this.checkAllFeedbacks()
		const state = bus === 0 ? this.pvwMute : this.pgmMute
		await this.sendCommand(0x41, 0x00, bus, state ? 0x01 : 0x00, 0x00)
	}

	/** Single-channel AFV toggle (protocol 14.1: 0x40 0x01, DAT2=0 configure, DAT3=channel 0-4, DAT4=0 off/1 on) */
	async toggleAfv(channel: number): Promise<void> {
		this.afvStates[channel] = !this.afvStates[channel]
		this.checkAllFeedbacks()
		await this.sendCommand(0x40, 0x01, 0x00, channel, this.afvStates[channel] ? 0x01 : 0x00)
	}

	/** Select layer (protocol 6.8: 0x20 0x08, DAT2=0 LayerB/1 LayerA) */
	async setLayer(sel: number): Promise<void> {
		this.layerSel = sel === 1 ? 1 : 0
		this.checkAllFeedbacks()
		await this.sendCommand(0x20, 0x08, this.layerSel, 0x00, 0x00)
	}

	/** Reads the output volume (protocol 15.4: 0x41 0x03, DAT2=0 monitor/1 PGM; falls back to the cached value after a 1s timeout) */
	async queryVolume(bus: number): Promise<number> {
		const resolvers = bus === 0 ? this.pvwVolumeResolvers : this.pgmVolumeResolvers
		const cached = bus === 0 ? this.pvwVolume : this.pgmVolume
		return new Promise((resolve) => {
			const timer = setTimeout(() => {
				resolvers.length = 0
				resolve(cached)
			}, 1000)

			resolvers.push((volume) => {
				clearTimeout(timer)
				resolve(volume)
			})

			this.sendCommand(0x41, 0x03, bus, 0x00, 0x00).catch(() => {
				clearTimeout(timer)
				resolvers.length = 0
				resolve(cached)
			})
		})
	}

	/** Output volume stepping +/-1 (protocol 15.3: 0x41 0x02, DAT2=0 monitor/1 PGM, DAT3=volume 0-100) */
	async stepVolume(bus: number, delta: number): Promise<void> {
		const current = await this.queryVolume(bus)
		const next = Math.min(100, Math.max(0, current + delta))
		if (next !== current) {
			if (bus === 0) {
				this.pvwVolume = next
			} else {
				this.pgmVolume = next
			}
			await this.sendCommand(0x41, 0x02, bus, next, 0x00)
		}
	}

	getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields()
	}

	getCurrentPgm(): number {
		return this.currentPgm
	}

	getCurrentPvw(): number {
		return this.currentPvw
	}

	getCurrentBackground(): number {
		return this.currentBackground
	}

	getPipEnabled(): boolean {
		return this.pipEnabled
	}

	getKeyMode(): number {
		return this.keyMode
	}

	/**
	 * Current chroma key color category: 'green' / 'blue' / ''.
	 * Prefers the RGB of the reported chromaInfo.color (G>B=green, B>G=blue);
	 * when the report is indistinguishable (e.g. white #FFFFFF), falls back to the last key_green/key_blue choice sent by this module.
	 */
	getChromaClass(): '' | 'green' | 'blue' {
		// 1) RGB of the reported chromaInfo.color (G>B=green, B>G=blue)
		const hex = this.chromaColor.replace('#', '')
		if (/^[0-9a-fA-F]{6}$/.test(hex)) {
			const g = parseInt(hex.slice(2, 4), 16)
			const b = parseInt(hex.slice(4, 6), 16)
			if (g > b) return 'green'
			if (b > g) return 'blue'
		}
		// 2) Chroma range params (protocol 10.4 table: green 560-1232, blue 1600-1984)
		if (this.chromaMin !== null) {
			if (this.chromaMin >= 560 && this.chromaMin <= 1232) return 'green'
			if (this.chromaMin >= 1600 && this.chromaMin <= 1984) return 'blue'
		}
		// 3) Fallback: the last key_green/key_blue choice sent by this module
		return this.chromaHint
	}

	/** Records the chroma choice this module last sent (called by the key_green/key_blue actions) */
	setChromaHint(hint: 'green' | 'blue'): void {
		this.chromaHint = hint
		this.checkAllFeedbacks()
	}

	getLogoEnabled(): boolean {
		return this.logoEnabled
	}

	getBackgroundEnabled(): boolean {
		return this.backgroundEnabled
	}

	getPgmMute(): boolean {
		return this.pgmMute
	}

	getPvwMute(): boolean {
		return this.pvwMute
	}

	getAfvState(channel: number): boolean {
		return this.afvStates[channel] ?? false
	}

	getPgmVolume(): number {
		return this.pgmVolume
	}

	getPvwVolume(): number {
		return this.pvwVolume
	}

	getCurrentScene(): number {
		return this.currentScene
	}

	/**
	 * Scene recall/exit toggle (protocol 12.1 recall / 12.4 exit current scene).
	 * Calling the already-active scene exits it; after exit, optimistically set 0 and read back to re-sync
	 * (12.4 defines DAT2=0x00; the example frame's DAT1=0x03 contradicts the definition — follow the definition).
	 */
	async toggleScene(scene: number): Promise<void> {
		if (this.currentScene === scene) {
			await this.sendCommand(0x30, 0x04, 0x00, 0x00, 0x00)
			this.currentScene = 0
			this.checkAllFeedbacks()
			this.sendCommand(0x30, 0x01, 0x00, 0x00, 0x00).catch(() => {})
		} else {
			await this.sendCommand(0x30, 0x00, scene, 0x00, 0x00)
		}
	}

	getLayerSel(): number {
		return this.layerSel
	}

	getEffectType(): number {
		return this.effectType
	}

	getFtbEnabled(): boolean {
		return this.ftbEnabled
	}

	/**
	 * Momentary action flash: lights for ms milliseconds after running (no protocol state needed).
	 */
	flashAction(id: string, ms = 100): void {
		this.flashUntil[id] = Date.now() + ms
		this.checkAllFeedbacks()
		setTimeout(() => {
			delete this.flashUntil[id]
			this.checkAllFeedbacks()
		}, ms)
	}

	isFlashing(id: string): boolean {
		return (this.flashUntil[id] ?? 0) > Date.now()
	}

	getStreamPush(index: number): boolean {
		return this.streamPushStates[index] ?? false
	}

	getRecordEnabled(): boolean {
		return this.recordEnabled
	}

	async queryBackground(): Promise<number> {
		return new Promise((resolve) => {
			// Keep the wrapped function reference so it can be removed by reference on timeout/send failure, avoiding leftover entries
			let waiter: ((index: number) => void) | undefined
			const removeWaiter = () => {
				if (!waiter) return
				const idx = this.backgroundQueryResolvers.indexOf(waiter)
				if (idx !== -1) this.backgroundQueryResolvers.splice(idx, 1)
				waiter = undefined
			}
			const timer = setTimeout(() => {
				removeWaiter()
				resolve(this.currentBackground)
			}, 1000)

			waiter = (index) => {
				clearTimeout(timer)
				removeWaiter()
				resolve(index)
			}
			this.backgroundQueryResolvers.push(waiter)

			this.sendCommand(0x22, 0x03, 0x00, 0x00, 0x00).catch(() => {
				clearTimeout(timer)
				removeWaiter()
				resolve(this.currentBackground)
			})
		})
	}
}

export { UpgradeScripts }

export default FeelworldL3Instance
