# Roam-A-Dome (Config) board

**Date:** 2026-07-06
**New board:** `libraries/boards/roam-a-dome-config.json`
**Source of truth:** reeltwo DomeControlFirmware `processConfigureCommand()` (the actual parser) — see the research reference `scratchpad/rad-config-reference.md`. Values are **code-correct**, overriding several README errors.
**Sibling board:** `roam-a-dome-motion` (the runtime `:DP` verbs, already shipped in v2.4.0).

## Context

The `#DP…` family is the EEPROM/setup half of the Roam-A-Dome (RDH) serial protocol — speeds, delays, PWM, Syren addresses, WiFi/remote, sequence storage. This is the second of the two Roam-A-Dome boards. **61 commands** (60 firmware `#DP` prefixes; `#DPHOMEPOS` splits into a no-arg "set here" and a numeric "set to N°").

Grammar: a line starting with `#` is routed whole to the config parser; the argument (if any) is parsed with `strtol` **immediately after the command name, no separator**. So the wire form is `#DP<NAME><arg>` (e.g. `#DPMAXSPEED50`, `#DPPIN10`).

## Data model

**Board:** `id: roam-a-dome-config`, `name: "Roam-A-Dome (Config)"`, `kind: device-native`, `confidence: high` (verified against `processConfigureCommand`), `firmware: "RDH (DomeControlFirmware)"`, routing `{ class:"broadcast", nativeWrapper:"none", durationSuffix:{ supported:false } }`. Command-id prefix `rad.cfg.` (distinct from motion's `rad.rotate.*`/`rad.spin`/etc.).

### Enums (4)

| Enum | Values |
|---|---|
| `rad.onOff` | `0` Off / Disabled, `1` On / Enabled |
| `rad.pin` | `1`…`8` (Pin 1 … Pin 8) |
| `rad.baudBasic` | 2400, 9600, 19200, 38400 |
| `rad.baudFull` | 2400, 9600, 19200, 38400, 57600, 115200 |

### Six command shapes

1. **No-arg action** — template is the literal (`#DPZERO`), `params: []`.
2. **Numeric setting** — `#DP<NAME>{value}`, one `type:int` param (min/max/default).
3. **On/Off toggle** — `#DP<NAME>{state}`, `state` = `rad.onOff`.
4. **Baud enum** — `#DP<NAME>{baud}`, `baud` = `rad.baudBasic`/`rad.baudFull`.
5. **Packed digits** — `#DPPIN{pin}{value}`, `pin` = `rad.pin`, `value` = `rad.onOff` (adjacent single-digit enums, no separator).
6. **Free-text (unbounded)** — a param with only a `name` (no `type`, no `enum`). Encodes fine; on reload it becomes an editable raw step and `web.test.js` skips its round-trip (the `chirp.pvoice` pattern). Used by `RNAME`, `RSECRET`, and `#DPS` (sequence body).

## Commands (61)

Bounded (int/enum) unless marked **free-text**. `state`=`rad.onOff`; `baud`=basic/full as noted. Safety: `cosmetic` (harmless query), `config` (setting), `power` (destructive/reboot), `movement` (moves dome).

### System / Actions (5)
| id | template | params | safety |
|---|---|---|---|
| `rad.cfg.zero` | `#DPZERO` | — | power |
| `rad.cfg.factory` | `#DPFACTORY` | — | power |
| `rad.cfg.restart` | `#DPRESTART` | — | power |
| `rad.cfg.status` | `#DPSTATUS` | — | cosmetic |
| `rad.cfg.config` | `#DPCONFIG` | — | cosmetic |

### Setup (2)
| `rad.cfg.setupVelocity` | `#DPSETUPVELOCITY{value}` | value int 0–1000, def 100 | config |
| `rad.cfg.setup` | `#DPSETUP` | — | movement |

### Speeds (6) — int 0–100
| `rad.cfg.maxspeed` | `#DPMAXSPEED{value}` | def 50 | config |
| `rad.cfg.homespeed` | `#DPHOMESPEED{value}` | def 40 | config |
| `rad.cfg.autospeed` | `#DPAUTOSPEED{value}` | def 30 | config |
| `rad.cfg.targetspeed` | `#DPTARGETSPEED{value}` | def 100 | config |
| `rad.cfg.minspeed` | `#DPMINSPEED{value}` | def 15 | config |
| `rad.cfg.inputspeed` | `#DPINPUTSPEED{value}` | def 100 *(undocumented)* | config |

### Position / Tolerances (5)
| `rad.cfg.autoleft` | `#DPAUTOLEFT{value}` | int 0–180, def 80 | config |
| `rad.cfg.autoright` | `#DPAUTORIGHT{value}` | int 0–180, def 80 | config |
| `rad.cfg.fudge` | `#DPFUDGE{value}` | int 0–20, def 5 | config |
| `rad.cfg.homePosHere` | `#DPHOMEPOS` | — (set home to current pos) | config |
| `rad.cfg.homePos` | `#DPHOMEPOS{deg}` | int 0–359, def 0 | config |

### Delays / Intervals (8)
| `rad.cfg.automin` | `#DPAUTOMIN{value}` | int 0–255 s, def 6 | config |
| `rad.cfg.automax` | `#DPAUTOMAX{value}` | int 0–255 s, def 8 | config |
| `rad.cfg.homemin` | `#DPHOMEMIN{value}` | int 0–255 s, def 6 | config |
| `rad.cfg.homemax` | `#DPHOMEMAX{value}` | int 0–255 s, def 8 | config |
| `rad.cfg.targetmin` | `#DPTARGETMIN{value}` | int 0–255 s, def 0 | config |
| `rad.cfg.targetmax` | `#DPTARGETMAX{value}` | int 0–255 s, def 1 | config |
| `rad.cfg.timeout` | `#DPTIMEOUT{value}` | int 0–30 s, def 5 | config |
| `rad.cfg.report` | `#DPREPORT{value}` | int 0–60000 ms, def 0 | config |

### Modes / Safety (5) — `state`=`rad.onOff`
| `rad.cfg.home` | `#DPHOME{state}` | def 0 | config |
| `rad.cfg.auto` | `#DPAUTO{state}` | def 0 | config |
| `rad.cfg.autosafety` | `#DPAUTOSAFETY{state}` | **def 1** | config |
| `rad.cfg.autorestart` | `#DPAUTORESTART{state}` | **def 1** *(undocumented)* | config |
| `rad.cfg.invert` | `#DPINVERT{state}` | **def 1** | config |

### Ramping (3)
| `rad.cfg.scale` | `#DPSCALE{state}` | onOff def 0 | config |
| `rad.cfg.ascale` | `#DPASCALE{value}` | int 0–255, **def 20** | config |
| `rad.cfg.dscale` | `#DPDSCALE{value}` | int 0–255, **def 50** | config |

### Serial I/O (3)
| `rad.cfg.serialin` | `#DPSERIALIN{state}` | onOff def 1 | config |
| `rad.cfg.serialout` | `#DPSERIALOUT{state}` | onOff def 1 | config |
| `rad.cfg.serialbaud` | `#DPSERIALBAUD{baud}` | baudBasic def 9600 | config |

### Syren / Sabertooth (4)
| `rad.cfg.syrenbaud` | `#DPSYRENBAUD{baud}` | baudFull def 9600 | config |
| `rad.cfg.syrenaddrin` | `#DPSYRENADDRIN{value}` | int 0–255, def 129 | config |
| `rad.cfg.syrenaddrout` | `#DPSYRENADDROUT{value}` | int 0–255, def 129 | config |
| `rad.cfg.syrenaddr` | `#DPSYRENADDR{value}` | int 0–255, def 129 | config |

### Sensor (1)
| `rad.cfg.sensorbaud` | `#DPSENSORBAUD{baud}` | baudFull def 115200 | config |

### PWM (7)
| `rad.cfg.pwmin` | `#DPPWMIN{state}` | onOff def 0 | config |
| `rad.cfg.pwmout` | `#DPPWMOUT{state}` | onOff def 0 | config |
| `rad.cfg.pwmarc` | `#DPPWMARC{state}` | onOff def 0 *(undocumented)* | config |
| `rad.cfg.pwmmin` | `#DPPWMMIN{value}` | int 801–2199 µs, def 1000 | config |
| `rad.cfg.pwmmax` | `#DPPWMMAX{value}` | int 801–2199 µs, def 2000 | config |
| `rad.cfg.pwmneutral` | `#DPPWMNEUTRAL{value}` | int 801–2199 µs, def 1500 | config |
| `rad.cfg.pwmdeadband` | `#DPPWMDEADBAND{value}` | int 0–50 %, def 5 | config |

### Pins (1)
| `rad.cfg.pin` | `#DPPIN{pin}{value}` | pin=`rad.pin`, value=`rad.onOff` | config |

### WiFi / Remote (6)
| `rad.cfg.wifi` | `#DPWIFI{state}` | onOff def 1 (reboots) | power |
| `rad.cfg.remote` | `#DPREMOTE{state}` | onOff def 1 (reboots) | power |
| `rad.cfg.rname` | `#DPRNAME{name}` | **free-text** (def "RoamADome") | config |
| `rad.cfg.rsecret` | `#DPRSECRET{secret}` | **free-text** (def "Astromech") | config |
| `rad.cfg.pair` | `#DPPAIR` | — *(undocumented)* | power |
| `rad.cfg.unpair` | `#DPUNPAIR` | — *(undocumented)* | power |

### Sequences (3)
| `rad.cfg.listSeq` | `#DPL` | — | cosmetic |
| `rad.cfg.deleteSeq` | `#DPD{slot}` | int 0–100, def 0 | config |
| `rad.cfg.storeSeq` | `#DPS{slot}:{body}` | slot int 0–100; **body free-text** | config |

### Debug (2)
| `rad.cfg.debug` | `#DPDEBUG{state}` | onOff def 0 | config |
| `rad.cfg.joy` | `#DPJOY` | — (VT100 joystick emulation) | cosmetic |

`storeSeq` note: the firmware's `#DPS` validator accepts only `Z / R / A / D / W / H` steps (NOT `S`/`T`/`P`, even though the live `:DP` grammar supports them). The `commentLabel` documents this.

## Grammar & collision analysis

All 61 templates begin `#DP`. Cross-board disjoint: motion is `:DP…`, uppity is `:P…`/`#P…` — the char after `#` is `D` (RAD-config) vs `P` (uppity), and RAD-config is `#…` vs motion `:…`.

Shared-prefix families are safe under the engine's anchored (`^…$`) regexes because **every numeric/bool arg is digits (`(-?\d+)` or `(0|1)`) while the longer command names continue with letters**:
- `#DPD{slot}` vs `#DPDEBUG{state}`/`#DPDSCALE{value}` — `#DPD5`→delete; `#DPDEBUG1`/`#DPDSCALE100` keep their letters (a digit-only arg can't match `EBUG`/`SCALE`).
- `#DPSYRENADDR{value}` vs `#DPSYRENADDRIN`/`#DPSYRENADDROUT` — `#DPSYRENADDR129`→addr; `…ADDRIN129` needs the literal `IN`, which `129` can't be. Mutually exclusive regardless of board order.
- `#DPHOME{state}` vs `#DPHOMESPEED`/`#DPHOMEMIN`/`#DPHOMEMAX`/`#DPHOMEPOS`/`#DPHOMEPOS{deg}`; `#DPAUTO{state}` vs the `#DPAUTO*` numeric/safety family; `#DPPWMIN{state}` vs `#DPPWMMIN{value}`; `#DPSCALE`/`#DPSTATUS`/`#DPSETUP*`/`#DPSERIAL*`/`#DPSENSOR*`/`#DPSYREN*`/`#DPS{slot}:` (all `#DPS…`) — each disambiguated the same way (`storeSeq`'s `#DPS(\d+):` needs a digit-then-colon that none of the `#DPS<letter>` commands present).
- `#DPHOMEPOS` (no-arg) vs `#DPHOMEPOS{deg}` and `#DPHOMEPOS` vs `#DPHOME{state}` — anchoring: trailing digits present → `homePos`; none → `homePosHere`; `POS` is not `0/1` so neither matches `#DPHOME{state}`.

Free-text params match as `(-?\d+)` in the engine, so a text value (e.g. `#DPRNAMEMyDome`) simply doesn't round-trip (raw on reload) — correct for unbounded params; a numeric-looking name would round-trip harmlessly.

**The workflow's grammar verifier will brute-force all 61 commands across their full domains + every other board's tokens to confirm zero collisions/misroutes** (this is the primary risk for a shared-prefix board this size).

## Versioning & files

| File | Change |
|---|---|
| `libraries/boards/roam-a-dome-config.json` | New board: 4 enums, 61 commands |
| `libraries/manifest.json` | Add board entry; bump `libraryVersion` `2.4.0` → `2.5.0` |
| `releases.json` | Bump `latest.libraryVersion` + `libraries[0].libraryVersion` → `2.5.0`; update notes/releasedAt |
| `test/load-node.test.js` | Bump component-count assertion `10` → `11`; bump 3 version assertions to `2.5.0` |
| `test/engine.test.js` | Add a `describe('Roam-A-Dome config')` block; bump the version assertion to `2.5.0` |

## Testing

- Every command needs `examples[0]` (`web.test.js`). Bounded commands' examples round-trip to a recognized step; the 3 free-text commands are exempt but still need an example.
- `describe('Roam-A-Dome config')` in `test/engine.test.js` asserting representative shapes: a no-arg (`#DPZERO`→`rad.cfg.zero`), a numeric (`#DPMAXSPEED50`), an on/off (`match('#DPINVERT1')`→`rad.cfg.invert` state `1`), a baud enum, the packed-pin (`match('#DPPIN10')`→`rad.cfg.pin` {pin `1`, value `0`}), and the shared-prefix disambiguations that matter most: `#DPD0`→`deleteSeq` vs `#DPDEBUG1`→`debug` vs `#DPDSCALE100`→`dscale`; `#DPSYRENADDR129`→`syrenaddr` vs `#DPSYRENADDRIN129`→`syrenaddrin`; `#DPHOME1`→`home` vs `#DPHOMESPEED40`→`homespeed` vs `#DPHOMEPOS`→`homePosHere` vs `#DPHOMEPOS90`→`homePos`. Plus non-collision with the config board's sibling and uppity (`#PD0`→`uppity.cfg.deleteSeq` unchanged).
- `npm run validate && npm test` green.

## Out of scope

- The runtime `:DP…` motion verbs — already the `roam-a-dome-motion` board.
- Validating the `#DPS` body's mini-DSL content (it's a free-text field; the composer user is responsible for a valid `Z/R/A/D/W/H` body).
- The bare no-arg *toggle* forms of `#DPHOME`/`#DPAUTO`/`#DPWIFI` (YAGNI — the board offers explicit `0`/`1` setters).
- The undocumented `:DPQ` servo-move runtime command (belongs to motion, and is `USE_SERVOS`-only / undocumented).
