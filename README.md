<h1 align="center">💧 Hydro Tracker — Ulanzi Deck Plugin</h1>

<p align="center">
  <b>A personal hydration coach on a single key.</b><br>
  Calculates your daily water goal, counts down to each glass, and reminds you to drink.
</p>

<p align="center">
  <img alt="version" src="https://img.shields.io/badge/version-1.0.0-00B4D8">
  <img alt="platform" src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS-0b131c">
  <img alt="license" src="https://img.shields.io/badge/license-MIT-00B4D8">
  <img alt="i18n" src="https://img.shields.io/badge/i18n-11%20locales-48CAE4">
</p>

---

## ✨ What it does

Set your profile and the key becomes a smart water countdown:

- **Personalized goal** — daily water target from your **age group, weight and container size**, split into evenly-spaced glasses across your active hours.
- **Live countdown ring** — drains toward your next glass; the centre shows the time left (mm:ss).
- **Four states** — 🔵 **HYDRATE** (idle), 🔵 **DRINK** (counting down), 🔴 **DRINK!** (time's up, blinking), 🟢 **DONE** (goal reached — the key floods green).
- **Press the key when you drink** — the countdown restarts for the next glass; dots track how many you've had.
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
| **Notify** | Desktop alert when it's time to drink / goal reached. |
| **Summer** | +15% water for hot weather. |
| **Quiet** | Silence notifications between two hours (e.g. 22:00 → 07:00). |
| **Theme** | Ocean, Deep Sea, Neon, Mint, Classic. |
| **Font** | Sans, Mono, Serif, Display. |
| **Animation** | Drink: Ripples / Drop / Fill · Ring: Clean / Glow / Tide. |

---

## 🔬 Hydration model

The daily goal uses a transparent, weight-based rule — the same logic clinicians use for maintenance fluids:

```
goal     = ⌈ weight(kg) × ml/kg × heat ÷ container(ml) ⌉
interval = 16 h ÷ goal
```

| Group | Rate | Rationale |
|-------|------|-----------|
| **Adult** | **35 ml/kg/day** | Common practical rule (~30–40 ml/kg/day). e.g. 70 kg → 2450 ml ≈ 2.5 L, close to EFSA adequate intake. |
| **Child** | **50 ml/kg/day** | Children need more water per kg (higher metabolic rate, larger body-surface-to-mass ratio — basis of the Holliday–Segar method). |

The target is spread evenly over a **16-hour active window** (no alerts while you sleep); **Summer** adds **+15%** for heat/exercise.

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
- **Lightweight** — the running `clean` ring uses only a 1 s tick (no extra loop); animated rings/idle run a low-fps loop; boot logging is off by default (`HYDRO_DEBUG=1` to enable).
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

Released under the **MIT License** — see [LICENSE](LICENSE).
Bundled libraries and fonts are credited in [THIRD-PARTY-LICENSES.md](THIRD-PARTY-LICENSES.md).

---

<p align="center">Made by <b>Jean Almeida</b> for the Ulanzi Deck community.</p>
