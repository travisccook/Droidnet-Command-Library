# WCB Firmware v6.1.5 — Full Command Sweep

**Date:** 2026-07-09
**Status:** Draft (awaiting review)
**Firmware source:** [greghulette/Wireless_Communication_Board-WCB](https://github.com/greghulette/Wireless_Communication_Board-WCB) @ latest release **v6.1.5_290119RJUN2026** (2026-06-29)

## Goal

The catalog was generated against **WCB 6.1.0**; the firmware is now **6.1.5**. An
audit — triggered by "we're missing some volume commands" — found that the
catalog models almost none of the WCB's own command surface. This sweep captures
the full command set the WCB firmware exposes over serial, so the composer can
build any WCB wire string.

The volume gap that started this is real and splits into two families the catalog
does **not** model at all:

1. **HCR vocalizer volume/fade verbs** (`;H,VOL`, `;H,VOLUP/VOLDN`, `;H,FADEIN/FADEOUT`, `;H,PLAY…FADEIN`) — our `wcb-hcr` board only had `STIM` + `PLAY`.
2. **MP3 Trigger audio verbs** (`;A,` prefix) — an entire command family with no board.

The user chose the **full firmware sweep**: close the volume gap, round out the
rest of the HCR verbs, add the MP3 audio board, **and** add a WCB-native board for
the `?` configuration/routing/sequence command set.

## Firmware files read (source of truth)

| File | Provides |
|---|---|
| `Code/WCB/WCB_Help.h` | The author's "WCB COMPLETE COMMAND REFERENCE" — every `?` and `;` command with description + exact syntax |
| `Code/WCB/WCB_HCR.cpp` | Exact `;H,` runtime grammar (verbs, arg formats, ranges) + `?HCR,` config |
| `Code/WCB/WCB_MP3.cpp/.h` | MP3 Trigger config + `;A,` audio command details |

During implementation each command's exact wire form is re-verified against the
v6.1.5 parser, and every command ships ≥1 `examples` string that the test suite
round-trips (encode → wire → match → params), which is the real correctness gate.

## Board decomposition

Three boards — one edited, two new. Rationale follows the board-identity
principle: one physical device / integration = one board; the category layer does
in-board grouping.

| Board | Status | `kind` | Scope |
|---|---|---|---|
| `wcb-hcr.json` | **edit** | `wcb-verb` | Add all remaining `;H,` verbs (volume/fade + non-volume round-out) |
| `wcb-mp3.json` | **new** | `wcb-verb` | The `;A,` MP3 Trigger audio family |
| `wcb-native.json` | **new** | `device-native` | The WCB's own `?` command set + the `;` routing/sequence verbs |

**Decision — one native board** (not split by function): the entire `?` set is the
WCB configuring itself, one device identity. The category layer
(`Setup / Config / Routing / Sequences / System / Power`) fixes dropdown grouping.

## Modeling conventions

- **Encoder:** `template` for every command. No custom encoder needed.
- **Param types:** enum (dropdown), `int` (with `min`/`max`, optional `pad`), and
  **free-text via `pattern`** for arbitrary payloads — sequence keys
  (`[A-Za-z0-9_]+`), MAC octets (`[0-9A-Fa-f]{2}`), routed messages / timer
  bodies / labels / passwords (`.+`). `pattern` params round-trip through `match`
  (engine builds `(pattern)` capture groups).
- **Prefix in template:** WCB verbs carry their own prefix in the template, exactly
  like the existing `maestro.json` (`;M{id}{seq}`). So `;H,VOL,{channel},{level}`,
  `;A,PLAY,{track}`, `?BAUD,S{port},{rate}`, etc.
- **Safety:** `cosmetic` = audio/emotion playback; `movement` = Maestro triggers;
  `config` = `?` setup/config commands; `power` = `?reboot`, `?ERASE,NVS`.
- **Confidence:** `high` — read directly from v6.1.5 firmware source.
- **Categories:** standard vocabulary where it fits (`Setup, Config, Sound,
  Volume, Sequences, System, Power`); `Routing` used as a per-board outlier on the
  native board for `;S`/`;W`/`;T` (the standard vocab has no routing bucket).

### Decisions captured during brainstorming

- **Model the routing verbs** `;Sx,msg`, `;Wx,msg`, `;T<ms>,cmd` (user chose to
  include them) with a free-text `.+` payload param — on the native board under a
  `Routing` category. Also model `;C<key>` / `;SEQ<key>` (run stored sequence).
- **Skip legacy aliases.** The help header's "LEGACY COMMANDS" block (`?HWx`,
  `?BAUDSx,rate`, `?SBIS3OFF`, …) still parses on-device but is deprecated — we
  author only the current canonical forms.
- **Delay/`;T` overlap (flagged risk).** The engine already uses `;t<ms>`
  (lowercase) as a standalone **delay step**; the firmware timer is `;T<ms>,cmd`
  (uppercase, wraps a command). They don't hard-collide (parse regex is anchored,
  lowercase, no trailing command), but they're conceptually adjacent. The native
  `;T{ms},{command}` command is modeled as requested; the spec notes that authors
  should prefer the composer's built-in delay step for simple waits.
- **`?SEQ,SAVE,key,value` (flagged limitation).** Its `value` is itself a
  `^`-joined command list, and `^` is the composer's step delimiter — a saved
  sequence containing `^` would be split into multiple steps on parse. Modeled
  best-effort with a `.+` value that must not contain `^` (single-command
  sequences round-trip; multi-command bodies are a documented limitation). `?SEQ`
  LIST/CLEAR are unaffected.

## Command inventory

### 1. `wcb-hcr.json` — additions (`;H,` verbs)

Existing (unchanged): `hcr.stim`, `hcr.play`. New enums: `hcr.volChannel`
(V/A/B), reuse `hcr.channel` (A/B) for WAV-only verbs.

**Volume / fade** (category `Volume`, safety `cosmetic`):

| id | template | params |
|---|---|---|
| `hcr.vol` | `;H,VOL,{channel},{level}` | channel ∈ V/A/B; level int 0–100 |
| `hcr.volUp` | `;H,VOLUP,{channel},{step}` | channel ∈ V/A/B; step int (default 5) |
| `hcr.volUpAll` | `;H,VOLUP` | — (all channels, +5) |
| `hcr.volDown` | `;H,VOLDN,{channel},{step}` | channel ∈ V/A/B; step int (default 5) |
| `hcr.volDownAll` | `;H,VOLDN` | — (all channels, −5) |
| `hcr.fadeIn` | `;H,FADEIN,{channel},{sec}` | channel ∈ A/B; sec int |
| `hcr.fadeOut` | `;H,FADEOUT,{channel},{sec}` | channel ∈ A/B; sec int |
| `hcr.playFade` | `;H,PLAY,{channel},{file},FADEIN,{sec}` | channel ∈ A/B; file int 0–9999; sec int (category `Sound`) |

**Non-volume round-out** (category `Emotion`/`Sound`/`System`, safety `cosmetic`):

| id | template | params |
|---|---|---|
| `hcr.overload` | `;H,OVERLOAD` | — |
| `hcr.setEmotion` | `;H,SETEMOTION,{emotion},{value}` | emotion ∈ H/S/M/C; value int 0–100 |
| `hcr.override` | `;H,OVERRIDE,{state}` | state ∈ ON/OFF |
| `hcr.muse` | `;H,MUSE` | — (single muse) |
| `hcr.museSet` | `;H,MUSE,{state}` | state ∈ ON/OFF/TOGGLE |
| `hcr.museGap` | `;H,MUSE,GAP,{min},{max}` | min,max int (seconds) |
| `hcr.stopEmote` | `;H,STOPEMOTE` | — |
| `hcr.resetEmotions` | `;H,RESETEMOTIONS` | — |
| `hcr.stop` | `;H,STOP` | — |
| `hcr.stopWav` | `;H,STOPWAV,{channel}` | channel ∈ A/B |
| `hcr.fn` | `;H,FN,{fn},{chan},{track}` | fn,chan,track int (numeric RC convention) |
| `hcr.raw` | `;H,RAW,{payload}` | payload `.+` |

### 2. `wcb-mp3.json` — new (`;A,` verbs), `kind: wcb-verb`

Categories: `Sound`, `Volume`, `System`. Safety `cosmetic`.

| id | template | params |
|---|---|---|
| `mp3.play` | `;A,PLAY,{track}` | track int 1–255 |
| `mp3.playCb` | `;A,PLAY,{track},ONFIN,{key}` | track int; key `[A-Za-z0-9_]+` (stored-seq callback) |
| `mp3.playFs` | `;A,PLAYFS,{track}` | track int 0–255 (filesystem order) |
| `mp3.playFsCb` | `;A,PLAYFS,{track},ONFIN,{key}` | track int; key |
| `mp3.stop` | `;A,STOP` | — (start/stop toggle) |
| `mp3.next` | `;A,NEXT` | — |
| `mp3.prev` | `;A,PREV` | — |
| `mp3.vol` | `;A,VOL,{level}` | level int 0–64 (0=loudest); `Volume` |
| `mp3.volUp` | `;A,VOLUP` | — (+5); `Volume` |
| `mp3.volDown` | `;A,VOLDN` | — (−5); `Volume` |
| `mp3.count` | `;A,COUNT` | — (`System`) |
| `mp3.ver` | `;A,VER` | — (`System`) |

(Implicit `,key` callback forms are omitted in favor of the explicit `ONFIN,key`
form to keep parsing unambiguous.)

### 3. `wcb-native.json` — new (`?` set + `;` routing), `kind: device-native`

Categories in order: `Setup, Config, Routing, Sequences, System, Power`. Safety
`config` unless noted. Enums: `wcb.serialPort` (S1–S5), `wcb.baud` (the documented
rate list), `wcb.hwVersion` (1/21/23/24/31/32), `wcb.onOff` (ON/OFF).

**Setup** (`config`): `?HW,{ver}` · `?WCB,{n}` (1–9) · `?WCBQ,{n}` (1–9) ·
`?MAC,2,{hex}` · `?MAC,3,{hex}` · `?EPASS,{password}`

**Config — serial:** `?BAUD,S{port},{rate}` · `?LABEL,S{port},{text}` ·
`?LABEL,CLEAR,S{port}` · `?LABEL,CLEAR,ALL` · `?BCAST,IN,S{port},{state}` ·
`?BCAST,OUT,S{port},{state}` · `?BCAST,RESET`

**Config — mapping:** `?MAP,SERIAL,S{port},{dest}` · `?MAP,SERIAL,S{port},R,{dest}`
· `?MAP,SERIAL,LIST` · `?MAP,SERIAL,CLEAR,S{port}` · `?MAP,SERIAL,CLEAR,ALL` ·
`?MAP,PWM,S{port},{dest}` · `?MAP,PWM,OUT,S{port}` · `?MAP,PWM,LIST` ·
`?MAP,PWM,CLEAR,S{port}` · `?MAP,PWM,CLEAR,ALL` · `?MAP,CLEAR,ALL`
(`dest` free-text `(?:S[1-5]|W[1-9]S[1-5])`)

**Config — devices:** `?KYBER,LOCAL|REMOTE|CLEAR|LIST` · `?MAESTRO,{spec}`
(spec `.+`, e.g. `M1:W2S1:57600`) · `?MAESTRO,LIST` · `?MAESTRO,CLEAR,{id}` ·
`?MAESTRO,CLEAR,ALL` · `?MP3,{spec}` (`S{port}:{baud}:V{vol}`) · `?MP3,LIST` ·
`?MP3,ONERR,{key}` · `?MP3,ONERR,CLEAR` · `?MP3,CLEAR` · `?HCR,PORT,S{port}:{baud}`
· `?HCR,POLL,{sec}` · `?HCR,LIST|STATUS|REFRESH|CLEAR` · `?HCR,GET,{field}`

**Routing** (safety varies): `;S{port},{message}` · `;W{wcb},{message}` ·
`;T{ms},{command}` (message/command free-text `.+`)

**Sequences:** `?SEQ,SAVE,{key},{value}` (value `.+`, no `^` — see limitation) ·
`?SEQ,LIST` · `?SEQ,CLEAR,{key}` · `?SEQ,CLEAR,ALL` · `;C{key}` · `;SEQ{key}`

**System:** `?ETM,ON|OFF` · `?ETM,TIMEOUT,{ms}` · `?ETM,HB,{sec}` ·
`?ETM,MISS,{count}` · `?ETM,BOOT,{sec}` · `?ETM,COUNT,{n}` · `?ETM,DELAY,{ms}` ·
`?ETM,CHAR` · `?ETM,CHKSM,{state}` · `?DEBUG,{state}` ·
`?DEBUG,ETM|PWM|MAESTRO|HCR,{state}` · `?STATS` · `?STATS,RESET` ·
`?DELIM,{char}` · `?FUNCCHAR,{char}` · `?CMDCHAR,{char}` · `?config` · `?backup`

**Power** (safety `power`): `?reboot` · `?ERASE,NVS`

Total native ≈ 65–75 commands (exact count settled during implementation).

## Versioning & provenance

- `libraries/manifest.json` → `libraryVersion` **4.0.0 → 4.1.0** (additive: new
  boards + commands, no id renames/removals).
- Update `manifest.json` `generatedFrom` and `wcb-hcr` `firmware` note to
  **WCB 6.1.5_290119RJUN2026**.
- Update `releases.json` for the released version.
- Register all three boards in `libraries/manifest.json` `boards[]`.

## Phasing (one branch, commit per phase)

1. **Phase 1 — volume gap** (original ask): HCR volume/fade verbs + new `wcb-mp3`
   board. Ship-able on its own.
2. **Phase 2 — HCR round-out:** the remaining non-volume `;H,` verbs.
3. **Phase 3 — `wcb-native`:** the `?` command set + `;` routing/sequence verbs.

## Testing & checklist (per repo conventions)

- Every command ≥1 `examples` string (suite exercises all examples).
- Update the component-count assertion in `test/library.test.js` (three boards:
  +2 new components, plus new commands on `wcb-hcr`).
- Bump the version assertion(s) that pin `libraryVersion`.
- `npm run validate && npm test` green before each phase commit.

## Out of scope / open questions

- **Native `?` config in a control composer.** These are board *setup* commands,
  not droid *motion/light* control. Included because the composer's stated purpose
  is "build a serial string to paste into your WCB config or serial monitor," so
  config strings are in scope. Confidence stays `high`.
- **`maestro.json` `;M` discrepancy.** Firmware help shows `;Mx,script` (comma);
  the existing board models `;M{id}{seq}` → `;M11` (no comma). Pre-existing, out of
  this sweep's scope — noted for a future reconciliation.
- **`?SEQ,SAVE` multi-command bodies** — documented limitation (see above).
