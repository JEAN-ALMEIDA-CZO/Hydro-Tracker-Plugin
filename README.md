<p align="center">
<img  alt="Banner Hydro Tracker" src="/com.hydro.tracker.ulanziPlugin/assets/marketing/brand-blue.png" width="10%">
</p> 
<h1 align="center">Hydro Tracker — Ulanzi Deck Plugin</h1>

<p align="center">
  <b>A personal hydration coach on a single key.</b><br>
  Calculates your daily water goal, counts down to each sip, and reminds you to drink.
</p>

<p align="center">
  <img alt="version" src="https://img.shields.io/badge/version-1.0.2-00B4D8">
  <img alt="platform" src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS-0b131c">
  <img alt="license" src="https://img.shields.io/badge/license-MIT-00B4D8">
  <img alt="i18n" src="https://img.shields.io/badge/i18n-11%20locales-48CAE4">
</p>
<img alt="Banner Hydro Tracker" src="/com.hydro.tracker.ulanziPlugin/assets/marketing/Banner_Hydro Tracker.jpeg">

---

## ✨ What it does

Set your profile and the key becomes a smart water countdown:

- **Personalized goal** — daily water target from your **age group, weight and container size**, spread evenly across your active hours.
- **Realistic sip model** — a container isn't chugged in one go, so it's divided into **sips based on its real volume** (about **20 ml per sip** — a 200 ml glass ≈ 10 sips). The countdown between sips stays comfortable **no matter the container size**.
- **On-key sip counter** — a small **`n/N`** readout and a **ball that fills sip by sip** sit together **above the timer**, so you can see exactly how far through the glass you are.
- **Live countdown ring** — drains toward your next glass; the centre shows the time left as **mm:ss**, switching to a compact **h:mm** (with the seconds small in the top-right corner) once an interval runs over an hour.
- **Four states** — 🔵 **HYDRATE** (idle), 🔵 **DRINK** (counting down), 🔴 **DRINK!** (time's up, blinking), 🟢 **DONE** (goal reached — the key floods green).
- **Short press = one sip** — logs a sip and fills the counter/ball; the countdown **keeps running** (it is not reset). Taking the last sip completes the glass.
- **Long press = a whole glass** — logs a full container at once, fills a dot, and **restarts the countdown** for the next glass.
- **Container units** — set your glass/bottle in **ml, L or oz**.
- **Desktop notifications** (Windows + macOS) when it's time to drink and when you hit the goal.
- **Summer mode** (+15% water on hot days) and **Quiet hours** (no alerts at night).
- **Themes & water animations** — 5 themes + drink animations (ripples, falling drop, fill) and ring styles (clean, glow, tide).
- **Vector fonts** — the digits render in real font paths (Sans / Mono / Serif / Display) on any deck renderer.
- **Built-in tutorial** — a modern, fully-localized guide that explains every state, how to configure it correctly, and the scientific basis of the goal.

Everything runs **locally** — no accounts, no API keys, no telemetry.

---

## 🎛️ Settings

| Option | Description |
|--------|-------------|
| **Age group** | Adult (35 ml/kg) or Child (50 ml/kg) — sets the hydration formula. |
| **Weight** | Your weight in kg or lbs. |
| **Container** | Your glass/bottle size in **ml, L or oz** — defines one "glass". |
| **Reminder pace** | Sip size — how finely a container is divided for the counter: **Frequent** (small ~15 ml sips), **Balanced** (~20 ml sips, default), **Relaxed** (big ~30 ml sips), or **Whole container** (one press per full container). Smaller sips = more taps per glass; it does not change the countdown. |
| **Notify** | Desktop alert when it's time to drink / goal reached. |
| **Summer** | +15% water for hot weather. |
| **Quiet** | Silence notifications between two hours (e.g. 22:00 → 07:00). |
| **Theme** | Ocean, Deep Sea, Neon, Mint, Classic. |
| **Font** | Sans, Mono, Serif, Display. |
| **Animation** | Drink: Ripples / Drop / Fill · Ring: Clean / Glow / Tide. |

---

## 🔬 Hydration model

The daily goal uses a transparent, weight-based rule — the same logic clinicians use for maintenance fluids. The countdown is one glass interval; each container is divided into sips by its real volume for the on-key counter:

```
goal     = ⌈ weight(kg) × ml/kg × heat ÷ container(ml) ⌉
interval = 16 h ÷ goal                              (the per-glass countdown)
sips     = round( container(ml) ÷ ml-per-sip )      (ml-per-sip from pace: 15 / 20 / 30)
```

| Group | Rate | Rationale |
|-------|------|-----------|
| **Adult** | **35 ml/kg/day** | Common practical rule (~30–40 ml/kg/day). e.g. 70 kg → 2450 ml ≈ 2.5 L, close to EFSA adequate intake. |
| **Child** | **50 ml/kg/day** | Children need more water per kg (higher metabolic rate, larger body-surface-to-mass ratio — basis of the Holliday–Segar method). They also take smaller swallows, so the **sip size is capped at 20 ml** for children regardless of pace. |

The target is spread evenly over a **16-hour active window** (no alerts while you sleep); **Summer** adds **+15%** for heat/exercise. **Reminder pace** sets the sip size (~15 / 20 / 30 ml), which sets how many sips a container takes — a 200 ml glass at the default 20 ml pace is 10 sips, matching a real drinking session. The countdown is one glass interval and is **not** reset when you log a sip; a **long press** logs a whole glass and restarts it.

**Sources:** EFSA Panel on Dietetic Products — *Dietary Reference Values for water* (EFSA Journal, 2010); Holliday MA, Segar WE — *The maintenance need for water in parenteral fluid therapy* (Pediatrics, 1957); WHO / Institute of Medicine water intake guidance.

> This plugin is a habit-building reminder, not medical advice. Adjust to your own needs and consult a professional for clinical hydration targets.

---

## 🌍 Languages

English · Português (BR/PT) · Español · Français · Deutsch · Italiano · 日本語 · 한국어 · 中文 (简体/繁體)

UI and the built-in **tutorial page** auto-detect the Ulanzi/system language.

---

## 💾 Installation

### From the Ulanzi Store
Search for **Hydro Tracker** in the UlanziDeck plugin store and install.

### Manual / from source
1. Clone or download this repository.
2. Run `npm install` (installs `opentype.js` and `ws`).
3. Copy the folder `com.hydro.tracker.ulanziPlugin` into:
   - **Windows:** `%AppData%\Roaming\Ulanzi\UlanziDeck\Plugins\`
   - **macOS:** `~/Library/Application Support/Ulanzi/UlanziDeck/Plugins/`
4. Restart **UlanziDeck Studio**.

> Requires UlanziDeck software **2.1.0+**.

---

## 🛠️ Tech & compatibility

- **Cross-platform** — `os`/`path` aware, no hardcoded paths. Windows + macOS.
- **No native binaries** — pure-JS dependencies (`opentype.js`, `ws`), fully portable.
- **Lightweight** — the `clean` ring uses only a 1 s tick (no extra loop); animated rings/idle run a low-fps loop; **vector digits are cached** and **identical frames are never re-sent to the deck**, so a resting key barely touches the CPU. Boot logging is off by default (`HYDRO_DEBUG=1` to enable).
- **Move-safe countdown** — a running countdown (and its sip progress) is preserved by action id, so moving the key to another slot or switching pages no longer resets it.
- **Vector digits** — fonts converted to SVG paths so the chosen font renders on every deck renderer.

---

## 📦 Project structure

```
com.hydro.tracker.ulanziPlugin/
├── manifest.json
├── plugin/app.js               # backend: hydration math + SVG renderer + notifications
├── property-inspector/
│   ├── inspector.html / .js     # settings panel
│   └── tutorial.html            # modern multi-language guide
├── libs/                        # Ulanzi SDK + css
├── assets/                      # icons, fonts, author photo
├── <locale>.json                # 11 localization files
├── LICENSE
└── THIRD-PARTY-LICENSES.md
```

---

## 📄 License

Released under the **MIT License** — see [LICENSE](com.hydro.tracker.ulanziPlugin/LICENSE).
Bundled libraries and fonts are credited in [THIRD-PARTY-LICENSES.md](com.hydro.tracker.ulanziPlugin/THIRD-PARTY-LICENSES.md).

---

<p align="center">Made by <b>Jean Almeida</b> for the Ulanzi Deck community.</p>
