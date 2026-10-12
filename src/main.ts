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
	private currentPgm: number = 0
	private currentPvw: number = 0
	private currentBackground: number = 1
	private backgroundQueryResolvers: Array<(index: number) => void> = []
	/** 推流开关，索引 0-3 = STREAM1-4（新协议 25.5 / 0xB1 0x58 streamInfo） */
	private streamPushStates: boolean[] = [false, false, false, false]
	/** 推流地址为空警告显示截止时间（开启推流未获 b158 确认时），索引 0-3 */
	private streamWarnUntil: number[] = [0, 0, 0, 0]
	/** 开启推流等待 b158 确认的等待者，索引 0-3 */
	private streamConfirmWaiters: Record<number, Array<(ok: boolean) => void>> = {}
	/** 录制开关（新协议 26.2 / 0xB1 0x58 recordInfo） */
	private recordEnabled: boolean = false
	/** U 盘是否存在（null=未知；由 0x61 0x09 应答 / recordInfo.diskSpace 推断） */
	private udiskExists: boolean | null = null
	private udiskResolvers: Array<(ok: boolean) => void> = []
	/** 无 U 盘警告显示截止时间 */
	private recordWarnUntil: number = 0
	/** 接收缓冲：用于 JSON 变长帧的拼包解析 */
	private rxBuffer: Buffer = Buffer.alloc(0)

	// ---- 第一期：开关型功能状态缓存（由设备应答/主动上报刷新） ----
	/** PIP 画中画开关（新协议 6.5/6.6） */
	private pipEnabled: boolean = false
	/** 抠像模式：0=关闭 1=色度 2=亮度（新协议 10.3） */
	private keyMode: number = 0
	/** 色度抠像颜色（keyInfo.chromaInfo.color，用于区分绿幕/蓝幕） */
	private chromaColor: string = ''
	/** 色度抠像区间下限（10.6 应答 min / keyInfo.chromaInfo.minValue，用于区分绿幕/蓝幕） */
	private chromaMin: number | null = null
	/** 本模块最后一次下发的色度选择（设备上报颜色无法区分时回退用） */
	private chromaHint: '' | 'green' | 'blue' = ''
	/** LOGO 开关（实测不区分 Preview/Program，DAT2 0x00/0x01 等效，统一用 0x00） */
	private logoEnabled: boolean = false
	/** 背景图层开关（新协议 8.1/8.3 DAT2） */
	private backgroundEnabled: boolean = false
	/** 输出静音：PVW（监听，DAT2=0x00）/ PGM（DAT2=0x01），新协议 15.1/15.2 */
	private pvwMute: boolean = false
	private pgmMute: boolean = false
	/** AFV 开关，索引 0-4 = HDMI1-4 + MEDIA（新协议 14.1） */
	private afvStates: boolean[] = [false, false, false, false, false]
	/** 输出音量 0-100（新协议 15.3/15.4；0=监听(PVW)，1=PGM） */
	private pvwVolume: number = 0
	private pgmVolume: number = 0
	private pvwVolumeResolvers: Array<(volume: number) => void> = []
	private pgmVolumeResolvers: Array<(volume: number) => void> = []
	/** 当前场景编号：0=未选中，1-8（新协议 12.1/12.2） */
	private currentScene: number = 0
	/** 当前选中图层：0=LayerB，1=LayerA（新协议 6.8/6.9） */
	private layerSel: number = 0
	/** 当前特效类型枚举：0=MIX，1=DIP，3=WIPE（新协议 13.2 + 产品确认） */
	private effectType: number = -1
	/** FTB 黑场状态（新协议 13.9 / 0xB1 0x58 transInfo.ftbEnable） */
	private ftbEnabled: boolean = false
	/** 瞬时动作闪烁高亮：actionId → 熄灭时间戳 */
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
		if (this.socket) {
			this.socket.close()
			this.socket = null
		}
	}

	async configUpdated(config: ModuleConfig): Promise<void> {
		this.config = config
		if (this.socket) {
			this.socket.close()
			this.socket = null
		}
		await this.connect()
	}

	private async connect(): Promise<void> {
		try {
			this.socket = dgram.createSocket('udp4')

			this.socket.on('error', (err) => {
				this.log('error', `Socket error: ${err.message}`)
				this.updateStatus(InstanceStatus.ConnectionFailure)
			})

			this.socket.on('message', (msg) => {
				this.handleResponse(msg)
			})

			this.socket.on('listening', () => {
				this.updateStatus(InstanceStatus.Ok)
				this.log('info', `Connected to ${this.config.host}:${this.config.port}`)
				// 连接建立后同步一次各开关状态（产品要求：刚连接时读取按钮状态）
				this.syncAllStates()
			})

			this.socket.bind()
		} catch (err) {
			this.log('error', `Connection failed: ${err}`)
			this.updateStatus(InstanceStatus.ConnectionFailure)
		}
	}

	/** 等待 JSON 数据块补齐的状态（用于分片丢失时的超时恢复） */
	private jsonWait: { total: number; head: string } | null = null
	private jsonWaitTimer: NodeJS.Timeout | null = null

	private handleResponse(msg: Buffer): void {
		this.log('debug', `Received: ${msg.toString('utf8')}`)
		this.rxBuffer = Buffer.concat([this.rxBuffer, msg])
		this.parseRxBuffer()
	}

	/**
	 * 按协议解析接收缓冲：
	 * - 1.1：定长帧 19 字符，CHKSUM = (ADDR+SN+CMD+DAT1..DAT4) & 0xFF，校验失败按脏数据逐字节重同步
	 * - 1.5：0xB0/0xB1 且 DAT1~4 全 0xFF 为"不支持命令"错误应答，无数据块，按定长帧消费
	 * - 1.3：0xB0/0xB1 正常帧以 DAT3/DAT4（LSB/MSB，含末尾校验字节）为数据块长度，凑齐即解析
	 * - 长度字段异常时退回花括号配对兜底；数据块超时未到齐则丢弃帧头恢复队列
	 */
	private parseRxBuffer(): void {
		for (;;) {
			if (this.rxBuffer.length < 19) {
				break
			}
			if (this.rxBuffer[0] !== 0x28 /* '(' */) {
				// 丢弃脏数据直至重新同步到帧头
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

			// 协议 1.1：校验和不符 → 帧内容损坏，逐字节丢弃直至重新同步
			const expectedChksum = (addr + sn + cmd + dat1 + dat2 + dat3 + dat4) & 0xff
			if (chksum !== expectedChksum) {
				this.log('debug', `Checksum mismatch, resync: ${head}`)
				this.rxBuffer = this.rxBuffer.subarray(1)
				continue
			}

			if (cmd === 0xb0 || cmd === 0xb1) {
				// 协议 1.5：不支持的命令/错误应答，DAT1~4 全 0xFF，无数据块
				// （实测主动查询 0xB1 0x58 设备即返回此帧；此前该帧会卡死花括号等待）
				if (dat1 === 0xff && dat2 === 0xff && dat3 === 0xff && dat4 === 0xff) {
					this.rxBuffer = this.rxBuffer.subarray(19)
					this.log('debug', `Device error/unsupported response, CMD=0x${cmd.toString(16).padStart(2, '0')}`)
					continue
				}

				// 协议 1.3：DAT3/DAT4 = 数据块长度（LSB/MSB，含末尾校验字节）
				const dataLen = dat3 | (dat4 << 8)
				if (dataLen >= 2 && dataLen <= 8192) {
					const total = 19 + dataLen
					if (this.rxBuffer.length < total) {
						// 数据块分片未到齐，等待后续 UDP 包
						this.waitJsonData(total, head)
						break
					}
					const dataBlock = this.rxBuffer.subarray(19, total)
					// 协议 1.3 称数据块末字节为"数据加和校验"，但实测固件（218+）该字节恒为固定字符
					// 'a'(0x61)，与各帧数据的求和/XOR 均不符（文档示例帧同样不符），故不做强校验；
					// JSON 以块内最后一个 '}' 为界由宽松解析器提取
					const trailer = dataBlock[dataBlock.length - 1]
					if (trailer !== 0x61) {
						this.log('debug', `JSON data block trailer 0x${trailer.toString(16)} (expected constant 0x61)`)
					}
					this.rxBuffer = this.rxBuffer.subarray(total)
					this.clearJsonWait()
					this.handleJsonFrame(cmd, Buffer.from(dataBlock.subarray(0, dataBlock.length - 1)), trailer)
					continue
				}

				// 长度字段异常（历史固件问题）：退回花括号配对兜底
				const open = this.rxBuffer.indexOf(0x7b /* '{' */)
				if (open === -1) {
					this.waitJsonData(this.rxBuffer.length + 1, head)
					break
				}
				// 找与首个 '{' 配对的 '}'（跳过字符串内的花括号）
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
					break // JSON 未完整，等待后续分片
				}
				const jsonBytes = Buffer.from(this.rxBuffer.subarray(open, end + 1))
				let consumed = end + 1
				// 跳过紧随的校验字节（若已到达且不是下一帧帧头 '('）
				if (consumed < this.rxBuffer.length && this.rxBuffer[consumed] !== 0x28) {
					consumed++
				}
				this.rxBuffer = this.rxBuffer.subarray(consumed)
				this.clearJsonWait()
				this.handleJsonFrame(cmd, jsonBytes, 0)
				continue
			}

			// 19 字符定长帧
			const frame = head
			this.rxBuffer = this.rxBuffer.subarray(19)
			this.handleFixedFrame(frame)
		}
	}

	/** 等待 JSON 数据块补齐；超过 500ms 仍不完整则判定分片丢失，丢弃帧头恢复解析队列 */
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
			// 缓冲头部仍是同一帧且数据块仍未到齐 → 分片丢失，丢弃帧头重新同步
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

	/** 解析 JSON 变长帧（0xB0/0xB1）并应用到状态缓存 */
	private handleJsonFrame(cmd: number, jsonBytes: Buffer, _chk: number): void {
		const jsonStr = jsonBytes.toString('utf8')
		const parsed = this.tryParseLooseJson(jsonStr)
		if (parsed === null) {
			this.log('error', `Failed to parse JSON frame (CMD=0x${cmd.toString(16).padStart(2, '0')}): ${jsonStr}`)
			return
		}
		// 兼容两种格式：{data:{...},...} 包装（.132 实测固件）与字段直接在根部的格式
		this.applyJsonReport(parsed?.data ?? parsed)
	}

	/**
	 * 宽松 JSON 解析：实测固件（L3Pro）的上报 JSON 不完全合法：
	 * - 未加引号的键名（如 data:、dev name:、dev uuid:，dev name 还含空格）
	 * - 末尾可能残留校验字节（如 }a）
	 * 依次尝试：修剪尾部残留 → 原样解析 → 修复未引号键名后解析。
	 */
	private tryParseLooseJson(jsonStr: string): any | null {
		const end = jsonStr.lastIndexOf('}')
		if (end === -1) {
			return null
		}
		const trimmed = jsonStr.slice(0, end + 1)
		const candidates = [trimmed]
		// 修复 { 或 , 后未加引号的键名（仅动键位，不影响已加引号的字符串值）
		const repaired = trimmed.replace(/([{,])\s*([A-Za-z_][A-Za-z0-9_ \-]*)\s*:/g, '$1"$2":')
		if (repaired !== trimmed) {
			candidates.push(repaired)
		}
		for (const candidate of candidates) {
			try {
				return JSON.parse(candidate)
			} catch {
				// 尝试下一个候选
			}
		}
		return null
	}

	/**
	 * 应用 0xB1 0x58 状态上报（设备主动推送 / 主动查询应答）。
	 * 已确认：pgmpvwInfo 的 id==1 条目为主通道，channel 编号 0 起始（HDMI1-4=0-3，MEDIA=4）。
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

		// 推流 1-4（实测 urlInfo 的 id 从 1 开始：id=1 对应 STREAM1……id=4 对应 STREAM4；
		// id=0 为其他含义的条目（如当前推流地址），忽略）
		const stream = data.streamInfo
		if (stream && Array.isArray(stream.urlInfo)) {
			stream.urlInfo.forEach((u: any, i: number) => {
				const idx = typeof u?.id === 'number' ? u.id - 1 : i
				if (idx >= 0 && idx < 4 && u && typeof u.isPush === 'boolean') {
					this.streamPushStates[idx] = u.isPush
				}
			})
			// 收到 streamInfo 推送即视为开启推流命令已被设备受理：
			// 实测地址为空时设备完全不回帧；地址非空时必回 b158，但其 isPush 滞后一拍，不作为确认依据
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

		// 录制
		const record = data.recordInfo
		if (record && typeof record === 'object') {
			if (typeof record.enable === 'boolean') {
				this.recordEnabled = record.enable
				updated = true
			}
			// U 盘存在性辅助判据（diskSpace > 0 视为存在）
			if (typeof record.diskSpace === 'number') {
				this.udiskExists = record.diskSpace > 0
			}
		}

		// 背景
		const bg = data.bgInfo
		if (bg && typeof bg === 'object') {
			if (typeof bg.enable === 'boolean') this.backgroundEnabled = bg.enable
			if (typeof bg.selIndex === 'number') this.currentBackground = bg.selIndex
			updated = true
		}

		// 抠像：enable + mode（1=色度 2=亮度）
		const key = data.keyInfo
		if (key && typeof key === 'object' && typeof key.enable === 'boolean') {
			this.keyMode = key.enable ? (key.mode === 2 ? 2 : 1) : 0
			updated = true
			// 色度抠像颜色/区间（用于绿幕/蓝幕互斥高亮）
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

		// 场景
		const scene = data.sceneInfo
		if (scene && typeof scene === 'object' && typeof scene.selIndex === 'number') {
			this.currentScene = scene.selIndex >= 1 && scene.selIndex <= 8 ? scene.selIndex : 0
			updated = true
		}

		// 特效类型
		const effect = data.effectInfo
		if (effect && typeof effect === 'object' && typeof effect.mode === 'number') {
			this.effectType = effect.mode
			updated = true
		}

		// FTB 黑场（transInfo.ftbEnable）
		const trans = data.transInfo
		if (trans && typeof trans === 'object' && typeof trans.ftbEnable === 'boolean') {
			this.ftbEnabled = trans.ftbEnable
			updated = true
		}

		// AFV：audioInfo.inputInfo 的 {id, afv}，id 1-5 = HDMI1-4 + MEDIA
		const audio = data.audioInfo
		if (audio && Array.isArray(audio.inputInfo)) {
			audio.inputInfo.forEach((input: any) => {
				if (input && typeof input.id === 'number' && input.id >= 1 && input.id <= 5 && typeof input.afv === 'boolean') {
					this.afvStates[input.id - 1] = input.afv
				}
			})
			updated = true
		}

		// LOGO（实测不区分 Preview/Program，logoInfo.enable 即开关状态）
		const logo = data.logoInfo
		if (logo && typeof logo === 'object' && typeof logo.enable === 'boolean') {
			this.logoEnabled = logo.enable
			updated = true
		}

		// 色度抠像参数（新协议 10.6 应答 0xB1 0x24 0x05；实测本固件 0xB1 0x58 推送也是同结构）
		// 实测 color 可能为空串，此时以 min 区间判定绿/蓝（10.4 参数表：green=560-1232，blue=1600-1984）
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

		// 读信号源应答：CMD=0x20，DAT1=0x0d PGM / 0x0e PVW，DAT2=信号源索引 0-4
		// （HDMI1-4=0-3、MEDIA=4，0 起始对应主界面按键 1-5，与 pgmpvwInfo JSON 的 channel 编号一致）
		if (cmd === 0x20 && (dat1 === 0x0d || dat1 === 0x0e)) {
			if (dat1 === 0x0d) {
				this.currentPgm = dat2
			} else {
				this.currentPvw = dat2
			}
			this.updateVariableValues()
			updated = true
		}

		// 新协议 20.9（文档表格）：应答 CMD=0x54 DAT1=0x0A，DAT2=PGM、DAT3=PVW
		// （本固件实测无应答，保留兼容处理）
		if (cmd === 0x54 && dat1 === 0x0a) {
			this.currentPgm = dat2
			this.currentPvw = dat3
			this.updateVariableValues()
			updated = true
		}

		// 新协议 8.3：背景信息读取，应答 CMD=0x22 DAT1=0x03，DAT2=开关，DAT3=选择图片索引
		if (cmd === 0x22 && dat1 === 0x03) {
			this.backgroundEnabled = dat2 === 1
			this.currentBackground = dat3
			for (const resolve of this.backgroundQueryResolvers) {
				resolve(dat3)
			}
			this.backgroundQueryResolvers = []
			updated = true
		}

		// 新协议 6.6：读取画中画开关，应答 CMD=0x20 DAT1=0x05，DAT2=0 关/1 开
		if (cmd === 0x20 && dat1 === 0x05) {
			this.pipEnabled = dat2 === 1
			updated = true
		}

		// 新协议 6.9：读取选中图层索引，应答 CMD=0x20 DAT1=0x09，DAT2=0 LayerB / 1 LayerA
		if (cmd === 0x20 && dat1 === 0x09) {
			this.layerSel = dat2 === 1 ? 1 : 0
			updated = true
		}

		// 新协议 10.3：读取抠图模式/开关，应答 CMD=0x24 DAT1=0x03，DAT2=0 关/1 色度/2 亮度
		if (cmd === 0x24 && dat1 === 0x03) {
			this.keyMode = dat2
			updated = true
		}

		// 新协议 9.4：获取 LOGO 开关状态，DAT2 固定 0x00（实测不区分 Preview/Program），DAT3=0 关/1 开
		if (cmd === 0x23 && dat1 === 0x03 && dat2 === 0x00) {
			this.logoEnabled = dat3 === 1
			updated = true
		}

		// 新协议 15.2：输出 MUTE 读取，应答 CMD=0x41 DAT1=0x01，DAT2=路(0 监听/1 PGM)，DAT3=0 关/1 开
		if (cmd === 0x41 && dat1 === 0x01) {
			if (dat2 === 0x00) {
				this.pvwMute = dat3 === 1
			} else if (dat2 === 0x01) {
				this.pgmMute = dat3 === 1
			}
			updated = true
		}

		// 新协议 15.4：输出音量读取，应答 CMD=0x41 DAT1=0x03，DAT2=路(0 监听/1 PGM)，DAT3=音量 0-100
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

		// 新协议 14.1：AFV 开关，按产品确认的应答理解：DAT3=通道号(0-4)，DAT4=0 关/1 开（假设，真机不符再调整）
		if (cmd === 0x40 && dat1 === 0x01 && dat3 >= 0 && dat3 <= 4) {
			this.afvStates[dat3] = dat4 === 1
			updated = true
		}

		// 新协议 12.2：读取当前场景索引，DAT2 ∈ 1-8 有效，否则视为未选中场景
		if (cmd === 0x30 && dat1 === 0x01) {
			this.currentScene = dat2 >= 1 && dat2 <= 8 ? dat2 : 0
			updated = true
		}

		// 新协议 13.2：特效模式读取，DAT2=当前特效枚举（0=MIX，1=DIP，3=WIPE）
		if (cmd === 0x31 && dat1 === 0x01) {
			this.effectType = dat2
			updated = true
		}

		// FTB 状态读取（218+ 协议表格为准）：请求 CMD=0x31 DAT1=0x09，
		// 应答 DAT1=0x09，DAT2=0x00 开启 / 0x01 关闭（表格应答 CMD=0x32，兼容同族回显 0x31）
		if ((cmd === 0x31 || cmd === 0x32) && dat1 === 0x09) {
			this.ftbEnabled = dat2 === 0x00
			updated = true
		}

		// 新协议 26.8：是否存在 U 盘，应答 CMD=0x61 DAT1=0x09，DAT2=0x00 不存在 / 0x01 存在
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
	 * 连接建立后的初始状态同步：依次发送各功能的读取命令（间隔 100ms 防洪泛）。
	 * 设备应答/后续主动上报会刷新对应状态缓存。
	 */
	private syncAllStates(): void {
		const queries: Array<() => Promise<void>> = [
			// 注：0xB1 0x58 全量状态查询已移除——实测固件不回 JSON，状态依赖设备被动上报
			() => this.sendCommand(0x20, 0x0d, 0x00, 0x00, 0x00), // 读 PGM 当前信号源
			() => this.sendCommand(0x20, 0x0e, 0x00, 0x00, 0x00), // 读 PVW 当前信号源
			() => this.sendCommand(0x20, 0x05, 0x00, 0x00, 0x00), // PIP 开关
			() => this.sendCommand(0x20, 0x09, 0x00, 0x00, 0x00), // 图层 AB
			() => this.sendCommand(0x24, 0x03, 0x00, 0x00, 0x00), // 抠像模式
			() => this.sendCommand(0xb1, 0x24, 0x05, 0x00, 0x00), // 色度抠像参数（新协议 10.6 定义值）
			() => this.sendCommand(0xb1, 0xa5, 0x03, 0x00, 0x00), // 色度抠像参数（10.6 示例帧旧值，部分固件只认这个）
			() => this.sendCommand(0x23, 0x03, 0x00, 0x00, 0x00), // LOGO 开关
			() => this.sendCommand(0x22, 0x03, 0x00, 0x00, 0x00), // 背景
			() => this.sendCommand(0x41, 0x01, 0x00, 0x00, 0x00), // 监听(PVW) MUTE
			() => this.sendCommand(0x41, 0x01, 0x01, 0x00, 0x00), // PGM MUTE
			() => this.sendCommand(0x41, 0x03, 0x00, 0x00, 0x00), // 监听(PVW) 音量
			() => this.sendCommand(0x41, 0x03, 0x01, 0x00, 0x00), // PGM 音量
			() => this.sendCommand(0x30, 0x01, 0x00, 0x00, 0x00), // 当前场景
			() => this.sendCommand(0x31, 0x01, 0x00, 0x00, 0x00), // 特效类型
			() => this.sendCommand(0x31, 0x09, 0x00, 0x00, 0x00), // FTB 黑场状态（218+ 协议表格；旧示例帧 0x38 已被固件拒绝）
			// AFV 1-5 路逐路读取（0x40 0x01，DAT2=0x01 读取，DAT3=通道）
			...this.afvStates.map((_, ch) => () => this.sendCommand(0x40, 0x01, 0x01, ch, 0x00)),
		]
		queries.forEach((query, i) => {
			setTimeout(() => {
				query().catch(() => {})
			}, i * 100)
		})
	}

	private updateVariableValues(): void {
		this.setVariableValues({
			current_pgm: this.currentPgm,
			current_pvw: this.currentPvw,
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
		// 新协议 19.1：单个按键点击 CMD=0x53 DAT1=0x01，DAT3=0x01 按下 / 0x02 松开
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
	 * 推流 toggle（新协议 25.5：0xB0 0x60 0x04，index 0-3 对应 STREAM1-4）。
	 * 开启时以"收到 0xB1 0x58 streamInfo 推送"为确认依据（实测其中的 isPush 滞后一拍不可靠）；
	 * 推流地址为空时设备不返回 b158，超时则按"地址为空"警告处理。
	 */
	async toggleStream(index: number): Promise<void> {
		if (this.streamPushStates[index]) {
			this.streamPushStates[index] = false
			this.checkAllFeedbacks()
			await this.sendJsonCommand(0xb0, 0x60, 0x04, { index, ispush: false, language: 1 })
			return
		}
		// 直接发送开启推流命令（0xB0 0x60 0x04），等待 b158 确认（1.5s）。
		// 超时有两种可能：1) 推流地址为空（设备静默） 2) 模块重载后状态失同步（设备已在推，静默忽略 ispush:true）。
		// 先补发一次 ispush:false 复位再重试，可自愈情况 2；仍无确认则按推流地址为空警告。
		let confirmed = await this.startStreamAndWaitConfirm(index)
		if (!confirmed) {
			await this.sendJsonCommand(0xb0, 0x60, 0x04, { index, ispush: false, language: 1 }).catch(() => {})
			// 略等片刻，避免设备对停止命令的应答推送被误当作重试开启的确认
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

	/** 发送开启推流命令并等待 b158 确认；超时/发送失败返回 false（1.5s） */
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

	/** 推流地址为空警告：按钮 ADDRESS EMPTY 反馈 + 日志，持续 1s */
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
	 * 查询 U 盘是否存在（新协议 26.8：0x61 0x09，应答 DAT2=0x01 存在 / 0x00 不存在）。
	 * 返回 true=存在 / false=不存在 / null=未知（超时或固件不支持）。
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
	 * 无 U 盘警告：仅 REC 按钮 NO DISK 反馈 + 日志，持续 1s。
	 * 注意不要用 updateStatus(Warning)：那是实例级状态，会在该实例的所有按钮右上角
	 * 画警告三角，无法只作用于单个按钮。
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
	 * 录制 toggle（新协议 26.2：0xB0 0x61 0x01，状态由 0xB1 0x58 recordInfo 校准）。
	 * 开始录制前先确认 U 盘存在；停止录制无需检查。
	 */
	async toggleRecord(): Promise<void> {
		if (this.recordEnabled) {
			this.recordEnabled = false
			this.checkAllFeedbacks()
			await this.sendJsonCommand(0xb0, 0x61, 0x01, { isStart: false })
			return
		}

		const disk = await this.queryUdisk()
		// disk: true=存在 false=不存在 null=未知（超时/固件不支持）
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

	// ---------- 第一期：开关 toggle / 音量步进 / setter 方法 ----------

	/** PIP 画中画开关 toggle（新协议 6.5：0x20 0x04，DAT2=0 关/1 开） */
	async togglePip(): Promise<void> {
		this.pipEnabled = !this.pipEnabled
		this.checkAllFeedbacks()
		await this.sendCommand(0x20, 0x04, this.pipEnabled ? 0x01 : 0x00, 0x00, 0x00)
	}

	/** 抠像开关 toggle（新协议 10.1：0x24 0x00；关闭↔色度模式） */
	async toggleKey(): Promise<void> {
		this.keyMode = this.keyMode === 0 ? 1 : 0
		this.checkAllFeedbacks()
		await this.sendCommand(0x24, 0x00, this.keyMode === 0 ? 0x00 : 0x01, 0x00, 0x00)
	}

	/** LOGO 开关 toggle（新协议 9.3：0x23 0x02，DAT2 固定 0x00，DAT3=0 关/1 开） */
	async toggleLogo(): Promise<void> {
		this.logoEnabled = !this.logoEnabled
		this.checkAllFeedbacks()
		await this.sendCommand(0x23, 0x02, 0x00, this.logoEnabled ? 0x01 : 0x00, 0x00)
		// 设备不主动推送 LOGO 状态，写入后回读校准
		setTimeout(() => {
			this.sendCommand(0x23, 0x03, 0x00, 0x00, 0x00).catch(() => {})
		}, 100)
	}

	/** 背景图层开关 toggle（新协议 8.1：0x22 0x00，DAT2=0 关/1 开） */
	async toggleBackgroundPower(): Promise<void> {
		this.backgroundEnabled = !this.backgroundEnabled
		this.checkAllFeedbacks()
		await this.sendCommand(0x22, 0x00, this.backgroundEnabled ? 0x01 : 0x00, 0x00, 0x00)
	}

	/** 输出静音 toggle（新协议 15.1：0x41 0x00，DAT2=0 监听(PVW)/1 PGM，DAT3=0 关/1 开） */
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

	/** AFV 单路开关 toggle（新协议 14.1：0x40 0x01，DAT2=0 配置，DAT3=通道 0-4，DAT4=0 关/1 开） */
	async toggleAfv(channel: number): Promise<void> {
		this.afvStates[channel] = !this.afvStates[channel]
		this.checkAllFeedbacks()
		await this.sendCommand(0x40, 0x01, 0x00, channel, this.afvStates[channel] ? 0x01 : 0x00)
	}

	/** 选择图层（新协议 6.8：0x20 0x08，DAT2=0 LayerB/1 LayerA） */
	async setLayer(sel: number): Promise<void> {
		this.layerSel = sel === 1 ? 1 : 0
		this.checkAllFeedbacks()
		await this.sendCommand(0x20, 0x08, this.layerSel, 0x00, 0x00)
	}

	/** 读取输出音量（新协议 15.4：0x41 0x03，DAT2=0 监听/1 PGM；1s 超时回退到缓存值） */
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

	/** 输出音量步进 ±1（新协议 15.3：0x41 0x02，DAT2=0 监听/1 PGM，DAT3=音量 0-100） */
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
	 * 当前色度抠像颜色类别：'green' / 'blue' / ''。
	 * 优先按设备上报的 chromaInfo.color 的 RGB 判定（G>B=绿，B>G=蓝）；
	 * 上报值无法区分（如白色 #FFFFFF）时回退到本模块最后一次下发 key_green/key_blue 的选择。
	 */
	getChromaClass(): '' | 'green' | 'blue' {
		// 1) 设备上报的 chromaInfo.color 按 RGB 判定（G>B=绿，B>G=蓝）
		const hex = this.chromaColor.replace('#', '')
		if (/^[0-9a-fA-F]{6}$/.test(hex)) {
			const g = parseInt(hex.slice(2, 4), 16)
			const b = parseInt(hex.slice(4, 6), 16)
			if (g > b) return 'green'
			if (b > g) return 'blue'
		}
		// 2) 色度区间参数判定（协议 10.4 参数表：green 560-1232，blue 1600-1984）
		if (this.chromaMin !== null) {
			if (this.chromaMin >= 560 && this.chromaMin <= 1232) return 'green'
			if (this.chromaMin >= 1600 && this.chromaMin <= 1984) return 'blue'
		}
		// 3) 回退：本模块最后一次下发 key_green/key_blue 的选择
		return this.chromaHint
	}

	/** 记录本模块最后一次下发的色度选择（key_green/key_blue 动作调用） */
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
	 * 场景调用/退出 toggle（新协议 12.1 调用 / 12.4 退出当前场景）。
	 * 当前场景已激活时再次调用则执行退出；退出后乐观置 0 并回读校准
	 *（12.4 定义 DAT2=0x00，示例帧 DAT1=0x03 与定义不符，以定义为准）。
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
	 * 瞬时动作闪烁高亮：执行后点亮 ms 毫秒再熄灭（无需协议状态支持）。
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
			// 保存包装函数引用，超时/发送失败时按引用移除，避免残留条目累积
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
