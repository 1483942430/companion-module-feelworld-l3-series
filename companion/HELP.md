# Feelworld L3 Video Switcher Module

This module provides control for the Feelworld L3 / L3 Pro video switcher over UDP, using the new CMD-domain protocol.

## Configuration

- **Device IP Address**: Enter the IP address of your Feelworld L3 switcher (default: `192.168.1.100`)
- **Port**: The UDP port for communication (default: `39187`)

The Companion host and the switcher must be on the same LAN, and your firewall must allow UDP traffic on the configured port.

> Note: UDP is connectionless — the connection shows "Ok" as soon as the local port is bound, which does not guarantee the device is reachable. On connect, the module sends a round of status queries; if the device is offline, commands fail silently.

## Actions

### Preview / Program Sources

- **PVW Source 1-5**: Set preview to the selected input
- **PGM Source 1-5**: Set program output to the selected input

### Transitions

- **CUT**: Instant transition from PVW to PGM
- **AUTO**: Auto transition
- **FTB**: Fade to Black
- **T-MIX / T-DIP / T-WIPE**: Set transition type

### Streaming (STREAM 1-4)

- **STREAM 1-4**: Toggle each streaming channel on/off.
  On start, the module waits for a confirmation push from the device (1.5s, one automatic retry).
  If the stream address is empty, the device stays silent and the button shows a yellow **ADDRESS EMPTY** warning for a moment.

### Recording

- **REC**: Start/Stop recording.
  Before starting, the module checks for a USB disk (`0x61 0x09`); without a disk the start is blocked and the button shows a yellow **NO DISK** warning for a moment.

### Scenes

- **SCN 1-8**: Recall a scene preset. Tapping the currently active scene again exits it (the highlight turns off).

### Media

- **PLAY / PAUSE / STOP / PREV / NEXT**: Media playback control

### PIP

- **PIP**: Toggle Picture in Picture
- **PIP TPL 1-8**: Select PIP template
- **PIP 9:16 / FULL**: PIP aspect
- **PIP X/Y/H/W ±100**: Position and size adjustments

### Keying

- **KEY**: Toggle keyer on/off
- **KEY GREEN / KEY BLUE**: Enable chroma keying with green/blue parameters (their highlights are mutually exclusive)

### Logo / Background

- **LOGO**: Toggle logo overlay
- **BKGD NEXT**: Cycle background image 1-6
- **BKGD ON/OFF**: Toggle the background layer

### Audio

- **MUTE PVW / MUTE PGM**: Toggle monitor (PVW) / program output mute
- **VOL± PVW / VOL± PGM**: Volume stepping
- **AFV 1-5**: Toggle audio-follow-video per input (HDMI1-4 + MEDIA)

### PTZ

- **PTZ UP/DOWN/LEFT/RIGHT/STOP/RESET**, **FOCUS AUTO/MAN**

### Misc

- **ZOOM TELE / WIDE**, **MENU**, **BACK**

## Feedbacks

Buttons dragged from the preset list carry their feedbacks automatically.

- **PGM/PVW Source Indicator**: Highlight when a specific source is on Program/Preview
- **PGM/PVW Match Alert**: Warning when Program and Preview show the same source
- **Recording Active** / **Recording Warn: No Disk**
- **Stream N Active** / **Stream Warn: Address Empty** (per stream)
- **Scene Active**, **Layer A/B Selected**, **FTB Active**
- **PIP / Key / LOGO / Background Active**
- **Chroma Key Green / Blue Active** (mutually exclusive)
- **Mute / AFV Active** (per output/channel)
- **Transition MIX/DIP/WIPE Selected**
- **Action Flash**: brief highlight when an instant action (CUT, media control, PTZ, etc.) runs

> Buttons placed before a firmware/module update should be re-dragged from the preset list to pick up updated feedbacks.

## Variables

- **current_pgm**: Current Program source (1-5)
- **current_pvw**: Current Preview source (1-5)

## Network Requirements

The switcher and Companion must be on the same network. The switcher uses UDP for communication; no polling connection is maintained, status updates arrive as device pushes.

## Troubleshooting

- **No reaction at all**: verify IP/port, same LAN, firewall allows UDP. Check the Companion log — every sent frame is logged as `Sending: (R...)`; if the device replies you will see `Received: (S...)`.
- **Device completely silent (no `Received:` lines)**: power-cycle the switcher. Known firmware issue: sending commands the firmware does not implement can stop its UDP responder.
- **Button state out of sync after restarting Companion**: the module re-syncs all states on connect; for streaming, the first toggle self-heals (stop + start retry).
- **JSON parse errors in the log**: copy the full log line and report it together with the firmware version.
