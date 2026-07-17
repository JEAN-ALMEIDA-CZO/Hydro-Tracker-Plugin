import UlanzideckApi from '../libs/node/ulanzideckApi.js';
import { exec, execFile } from 'child_process';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import opentype from 'opentype.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ICON_DIR = path.join(__dirname, '..', 'assets', 'icons');

const PLUGIN_VERSION = '1.0.1';
const DEBUG = process.env.HYDRO_DEBUG === '1';
const BOOT_LOG = path.join(os.tmpdir(), 'hydro_boot.log');

function bootLog(stage) {
  const line = `[${new Date().toLocaleString()}] Hydro v${PLUGIN_VERSION} — ${stage} (pid ${process.pid})`;
  console.log('[Hydro]', line);
  if (DEBUG) { try { fs.writeFileSync(BOOT_LOG, line + '\n'); } catch (e) {} }
}

bootLog('process start');

const NOTIFY_ICONS = {
  water: path.join(ICON_DIR, 'notify_water.png'),
  goal:  path.join(ICON_DIR, 'notify_goal.png')
};
const NOTIFY_APP_ICON = NOTIFY_ICONS.water;

const BLINK_AT = 7;

const THEMES = {
  ocean:   { ring: '#00B4D8', bg: '#08131c', track: '#123047' },
  deepsea: { ring: '#3D7BFF', bg: '#0a1030', track: '#16204a' },
  neon:    { ring: '#00BFFF', bg: '#0a0a1a', track: '#17203a' },
  mint:    { ring: '#19D3C5', bg: '#072420', track: '#0e3a34' },
  classic: { ring: '#5FA8E0', bg: '#15202b', track: '#22303d' }
};

const DONE_COLOR = '#2ECC71';
const ALERT_COLOR = '#E74C3C';

function hexToRgb(h) {
  h = String(h).replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function rgbToHex(r, g, b) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}
function contrastColor(hex) {
  if (!/^#?[0-9a-fA-F]{6}$/.test(String(hex || ''))) return '#FFFFFF';
  const { r, g, b } = hexToRgb(hex);
  const L = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  if (L > 0.85) return rgbToHex(r * 0.7, g * 0.7, b * 0.7);
  return rgbToHex(r + (255 - r) * 0.55, g + (255 - g) * 0.55, b + (255 - b) * 0.55);
}

const FONT_DIR   = path.join(__dirname, '..', 'assets', 'fonts');
const FONT_FILES = { sans: 'sans.ttf', mono: 'mono.ttf', serif: 'serif.ttf', display: 'display.ttf' };
const _fontCache = {};

function loadFont(key) {
  if (key in _fontCache) return _fontCache[key];
  try {
    const file = FONT_FILES[key] || FONT_FILES.sans;
    _fontCache[key] = opentype.parse(fs.readFileSync(path.join(FONT_DIR, file)).buffer);
  } catch (e) {
    console.error('[Hydro] font load failed:', key, e.message);
    _fontCache[key] = null;
  }
  return _fontCache[key];
}

function textToPath(font, text, fontSize, letterSpacing = 0) {
  const full = new opentype.Path();
  let x = 0;
  const scale = fontSize / font.unitsPerEm;
  for (const ch of text) {
    const g = font.charToGlyph(ch);
    full.extend(g.getPath(x, 0, fontSize));
    x += g.advanceWidth * scale + letterSpacing;
  }
  return full;
}

// glyph geometry (opentype path + bbox) is expensive — memoize per font/size/text
// so the once-a-second mm:ss redraw is nearly free (only ~60 distinct strings).
const _glyphCache = new Map();
function glyphSVG(fontKey, text, cx, cy, fontSize, fill, opacity) {
  const font = loadFont(fontKey);
  if (!font) {
    return `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle"
      fill="${fill}" font-size="${fontSize}" font-weight="bold"
      font-family="Arial, Helvetica, sans-serif" opacity="${opacity}">${text}</text>`;
  }
  const k = fontKey + '|' + fontSize + '|' + text;
  let g = _glyphCache.get(k);
  if (!g) {
    const p = textToPath(font, text, fontSize);
    const bb = p.getBoundingBox();
    g = { d: p.toPathData(2), x1: bb.x1, x2: bb.x2, y1: bb.y1, y2: bb.y2 };
    if (_glyphCache.size > 300) _glyphCache.clear();
    _glyphCache.set(k, g);
  }
  const dx = cx - (g.x1 + (g.x2 - g.x1) / 2);
  const dy = cy - (g.y1 + (g.y2 - g.y1) / 2);
  return `<path transform="translate(${dx.toFixed(1)} ${dy.toFixed(1)})" d="${g.d}" fill="${fill}" opacity="${opacity}"/>`;
}

const PHASE_LABELS_DEFAULT = {
  idle:    'HYDRATE',
  running: 'DRINK',
  alert:   'DRINK!',
  done:    'DONE'
};

// ── OS desktop notification ───────────────────────────────────────────────────
const NOTIFY_APP_ID = 'com.hydro.tracker.deck';
let _lastEnsuredTitle = '';

function psEscape(str) {
  return String(str).replace(/`/g, '``').replace(/\$/g, '`$').replace(/"/g, '`"');
}

const AUMID_CSHARP =
  `using System;\n` +
  `using System.Runtime.InteropServices;\n` +
  `namespace AumidLnk {\n` +
  `  [ComImport, Guid("00021401-0000-0000-C000-000000000046")] public class CShellLink {}\n` +
  `  [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("000214F9-0000-0000-C000-000000000046")]\n` +
  `  public interface IShellLinkW {\n` +
  `    void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] System.Text.StringBuilder f, int c, IntPtr p, uint fl);\n` +
  `    void GetIDList(out IntPtr ppidl); void SetIDList(IntPtr pidl);\n` +
  `    void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] System.Text.StringBuilder p, int c);\n` +
  `    void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string p);\n` +
  `    void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] System.Text.StringBuilder p, int c);\n` +
  `    void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string p);\n` +
  `    void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] System.Text.StringBuilder p, int c);\n` +
  `    void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string p);\n` +
  `    void GetHotkey(out short w); void SetHotkey(short w);\n` +
  `    void GetShowCmd(out int i); void SetShowCmd(int i);\n` +
  `    void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] System.Text.StringBuilder p, int c, out int i);\n` +
  `    void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string p, int i);\n` +
  `    void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string p, uint dw);\n` +
  `    void Resolve(IntPtr hwnd, uint fl);\n` +
  `    void SetPath([MarshalAs(UnmanagedType.LPWStr)] string p);\n` +
  `  }\n` +
  `  [ComImport, Guid("0000010b-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]\n` +
  `  public interface IPersistFile {\n` +
  `    void GetClassID(out Guid id); [PreserveSig] int IsDirty();\n` +
  `    void Load([MarshalAs(UnmanagedType.LPWStr)] string f, int m);\n` +
  `    void Save([MarshalAs(UnmanagedType.LPWStr)] string f, [MarshalAs(UnmanagedType.Bool)] bool r);\n` +
  `    void SaveCompleted([MarshalAs(UnmanagedType.LPWStr)] string f);\n` +
  `    void GetCurFile([MarshalAs(UnmanagedType.LPWStr)] out string f);\n` +
  `  }\n` +
  `  [StructLayout(LayoutKind.Sequential)] public struct PropertyKey { public Guid fmtid; public int pid; }\n` +
  `  [ComImport, Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]\n` +
  `  public interface IPropertyStore {\n` +
  `    void GetCount(out uint c); void GetAt(uint i, out PropertyKey k);\n` +
  `    void GetValue(ref PropertyKey k, out PropVariant pv);\n` +
  `    void SetValue(ref PropertyKey k, ref PropVariant pv); void Commit();\n` +
  `  }\n` +
  `  [StructLayout(LayoutKind.Explicit)] public struct PropVariant {\n` +
  `    [FieldOffset(0)] public ushort vt; [FieldOffset(8)] public IntPtr p;\n` +
  `  }\n` +
  `  public static class Lnk {\n` +
  `    public static void Create(string lnkPath, string target, string aumid) {\n` +
  `      var link = (IShellLinkW)new CShellLink();\n` +
  `      link.SetPath(target);\n` +
  `      var store = (IPropertyStore)link;\n` +
  `      var key = new PropertyKey { fmtid = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"), pid = 5 };\n` +
  `      var pv = new PropVariant { vt = 31, p = Marshal.StringToCoTaskMemUni(aumid) };\n` +
  `      store.SetValue(ref key, ref pv); store.Commit();\n` +
  `      Marshal.FreeCoTaskMem(pv.p);\n` +
  `      ((IPersistFile)link).Save(lnkPath, true);\n` +
  `    }\n` +
  `  }\n` +
  `}\n`;

function winRunPs(script) {
  const tmp = path.join(os.tmpdir(), `hydro_${Date.now()}_${Math.random().toString(36).slice(2)}.ps1`);
  try {
    fs.writeFileSync(tmp, '\uFEFF' + script, 'utf8');
    exec(`powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${tmp}"`,
      () => { try { fs.unlinkSync(tmp); } catch (e) {} });
  } catch (e) { /* ignore */ }
}

let _ensureTimer = null;
let _pendingTitle = '';
function ensureWinIdentity(title) {
  if (os.platform() !== 'win32' || !title) return;
  _pendingTitle = title;
  if (_ensureTimer) clearTimeout(_ensureTimer);
  _ensureTimer = setTimeout(() => { _ensureTimer = null; registerWinIdentity(_pendingTitle); }, 600);
}

function registerWinIdentity(title) {
  if (os.platform() !== 'win32' || !title || title === _lastEnsuredTitle) return;
  const display  = psEscape(title);
  const appIcon  = psEscape(NOTIFY_APP_ICON);
  const programs = path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs');
  const safeName = (String(title).replace(/[<>:"/\\|?*\n\r]/g, '').trim()) || 'Hydro Tracker';
  const desiredLnk = path.join(programs, safeName + '.lnk');
  const recordFile = path.join(os.tmpdir(), 'com.hydro.tracker.deck.notify_lnk');
  let oldLnk = '';
  try { oldLnk = fs.readFileSync(recordFile, 'utf8').trim(); } catch (e) {}

  const lnkPs = psEscape(desiredLnk);
  const oldPs = psEscape(oldLnk);

  const script =
    `$AppId='${NOTIFY_APP_ID}'\n` +
    `$lnk="${lnkPs}"\n` +
    `$old="${oldPs}"\n` +
    `if($old -and ($old -ne $lnk) -and (Test-Path -LiteralPath $old)){Remove-Item -LiteralPath $old -Force -ErrorAction SilentlyContinue}\n` +
    `if(-not(Test-Path -LiteralPath $lnk)){\n` +
    `Add-Type -Language CSharp -TypeDefinition @'\n` + AUMID_CSHARP + `'@\n` +
    `[AumidLnk.Lnk]::Create($lnk,"${appIcon}",$AppId)\n` +
    `Start-Sleep -Milliseconds 300\n` +
    `}\n` +
    `$reg="HKCU:\\Software\\Classes\\AppUserModelId\\$AppId"\n` +
    `if(-not(Test-Path $reg)){New-Item -Path $reg -Force | Out-Null}\n` +
    `New-ItemProperty -Path $reg -Name DisplayName -Value "${display}" -PropertyType String -Force | Out-Null\n` +
    `New-ItemProperty -Path $reg -Name IconUri -Value "${appIcon}" -PropertyType String -Force | Out-Null\n` +
    `$cache="HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings\\$AppId"\n` +
    `if(Test-Path $cache){Remove-Item -Path $cache -Recurse -Force -ErrorAction SilentlyContinue}\n`;

  try { fs.writeFileSync(recordFile, desiredLnk, 'utf8'); } catch (e) {}
  _lastEnsuredTitle = title;
  winRunPs(script);
}

function showWinToast(title, message, iconPath) {
  const t    = psEscape(title);
  const m    = psEscape(message);
  const icon = psEscape(iconPath || NOTIFY_APP_ICON);
  const script =
    `$AppId='${NOTIFY_APP_ID}'\n` +
    `$null=[Windows.UI.Notifications.ToastNotificationManager,Windows.UI.Notifications,ContentType=WindowsRuntime]\n` +
    `$xml=[Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastImageAndText02)\n` +
    `$tx=$xml.GetElementsByTagName('text')\n` +
    `$tx.Item(0).AppendChild($xml.CreateTextNode("${t}"))|Out-Null\n` +
    `$tx.Item(1).AppendChild($xml.CreateTextNode("${m}"))|Out-Null\n` +
    `$img=$xml.GetElementsByTagName('image')\n` +
    `$img.Item(0).SetAttribute('src',"${icon}")|Out-Null\n` +
    `$img.Item(0).SetAttribute('placement','appLogoOverride')|Out-Null\n` +
    `$toast=[Windows.UI.Notifications.ToastNotification]::new($xml)\n` +
    `[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($AppId).Show($toast)\n`;
  winRunPs(script);
}

const MAC_NOTIFIER_CANDIDATES = [
  path.join(__dirname, '..', 'assets', 'mac', 'terminal-notifier.app', 'Contents', 'MacOS', 'terminal-notifier'),
  '/opt/homebrew/bin/terminal-notifier',
  '/usr/local/bin/terminal-notifier',
  '/usr/bin/terminal-notifier'
];
function findMacNotifier() {
  for (const p of MAC_NOTIFIER_CANDIDATES) { try { if (fs.existsSync(p)) return p; } catch (e) {} }
  return null;
}

function macOsascript(title, message) {
  const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const ascript = `display notification "${esc(message)}" with title "${esc(title)}" sound name "Glass"`;
  execFile('osascript', ['-e', ascript], (err, _o, stderr) => {
    if (err) console.log(`[Hydro] (notify) ${title}: ${message}`);
  });
}

function notifyOS(title, message, iconPath) {
  try {
    if (os.platform() === 'win32') {
      if (title && title !== _lastEnsuredTitle) {
        ensureWinIdentity(title);
        setTimeout(() => showWinToast(title, message, iconPath), 2500);
      } else {
        showWinToast(title, message, iconPath);
      }
    } else if (os.platform() === 'darwin') {
      const tn = findMacNotifier();
      if (tn) {
        const args = ['-title', String(title), '-message', String(message), '-sound', 'Glass'];
        if (iconPath) args.push('-contentImage', String(iconPath));
        execFile(tn, args, (err) => {
          if (err) macOsascript(title, message);
        });
      } else {
        macOsascript(title, message);
      }
    } else {
      console.log(`[Hydro] (notify, ${os.platform()}) ${title}: ${message}`);
    }
  } catch (e) { /* ignore */ }
}

// ── geometry + small helpers ─────────────────────────────────────────────────
const CX = 128, CY = 116, R = 96, STROKE = 13;
const RING_C = 2 * Math.PI * R;

function mixHex(a, b, t) {
  const x = hexToRgb(a), y = hexToRgb(b);
  return rgbToHex(x.r + (y.r - x.r) * t, x.g + (y.g - x.g) * t, x.b + (y.b - x.b) * t);
}

// teardrop path: pointed top, round bulb of radius s centered at (cx, cy)
function teardrop(cx, cy, s) {
  return `M${cx} ${(cy - s * 2.05).toFixed(1)}` +
    ` C${(cx - s * 0.62).toFixed(1)} ${(cy - s * 0.95).toFixed(1)}, ${(cx - s).toFixed(1)} ${(cy - s * 0.30).toFixed(1)}, ${(cx - s).toFixed(1)} ${(cy + s * 0.10).toFixed(1)}` +
    ` A${s} ${s} 0 1 0 ${(cx + s).toFixed(1)} ${(cy + s * 0.10).toFixed(1)}` +
    ` C${(cx + s).toFixed(1)} ${(cy - s * 0.30).toFixed(1)}, ${(cx + s * 0.62).toFixed(1)} ${(cy - s * 0.95).toFixed(1)}, ${cx} ${(cy - s * 2.05).toFixed(1)} Z`;
}

// ── SVG key renderer ────────────────────────────────────────────────────────
// Design: countdown is clean (depleting ring + mm:ss). The animated water drop
// with pulsing ripples appears ONLY in the alert phase, to prompt drinking.
function generateSVG(opts) {
  const { timeLeft, totalTime, phase, displayLabel, flash, dimmed,
          currentAmount, dailyGoal, theme, font, animFrame, dropAnim, ringAnim, waterLevel } = opts;

  const t = THEMES[theme] || THEMES.ocean;
  const isDone  = phase === 'done';
  const isAlert = phase === 'alert';
  const af = animFrame || 0;

  let ring = t.ring;
  if (isDone) ring = DONE_COLOR;

  const bg    = t.bg;
  const track = t.track;
  const white = '#FFFFFF';

  const progress = isDone ? 1 : (totalTime > 0 ? Math.max(0, Math.min(1, timeLeft / totalTime)) : 1);
  const dash = (RING_C * (1 - progress)).toFixed(1);

  const mm = Math.floor(timeLeft / 60).toString();
  const ss = (timeLeft % 60).toString().padStart(2, '0');
  const timeStr = `${mm}:${ss}`;

  let defs = '', back = '', center = '', ringEls = '';
  const labelY = dimmed ? 150 : 176;

  // ── DONE ────────────────────────────────────────────────────────────
  if (isDone) {
    // the key floods with water (hydration complete) + bubbles + a check
    const waterCol = t.ring;
    const riseP = Math.min(1, af / 16);
    const level = 256 - riseP * 256;
    const amp = 6, wl = 40, ph = af * 0.4;
    let wp = `M0 ${level.toFixed(1)}`;
    for (let x = 0; x <= 256; x += 8) {
      wp += ` L${x} ${(level + amp * Math.sin(x / wl + ph)).toFixed(1)}`;
    }
    wp += ` L256 256 L0 256 Z`;
    defs += `<linearGradient id="floodg" x1="0" y1="0" x2="0" y2="1">` +
            `<stop offset="0" stop-color="${mixHex(waterCol, white, 0.25)}"/>` +
            `<stop offset="1" stop-color="${mixHex(waterCol, '#000000', 0.12)}"/></linearGradient>`;
    let bubbles = '';
    const seeds = [[60, 2, 4], [104, 60, 3], [150, 120, 5], [196, 80, 3.5], [128, 175, 3.5]];
    for (const sd of seeds) {
      const by = 252 - (((af * 3) + sd[1]) % 232);
      if (by > level + sd[2]) bubbles += `<circle cx="${sd[0]}" cy="${by.toFixed(1)}" r="${sd[2]}" fill="#FFFFFF" opacity="0.3"/>`;
    }
    back += `<path d="${wp}" fill="url(#floodg)"/>` + bubbles;
    const cP = Math.max(0, Math.min(1, (riseP - 0.5) / 0.4));
    if (cP > 0) {
      const sc = (0.7 + 0.3 * cP).toFixed(2);
      center = `<g transform="translate(128 120) scale(${sc}) translate(-128 -120)" opacity="${cP.toFixed(2)}">` +
        `<path d="M92 122 L116 148 L168 90" fill="none" stroke="#FFFFFF" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/></g>`;
    }
    ringEls = '';
  }

  // ── ALERT — animated water drop (3 styles: ripples | drop | wave) ────
  else if (isAlert) {
    defs += `<linearGradient id="dropg" x1="0" y1="0" x2="0" y2="1">` +
            `<stop offset="0" stop-color="${mixHex(ring, white, 0.30)}"/>` +
            `<stop offset="1" stop-color="${mixHex(ring, '#000000', 0.10)}"/></linearGradient>`;

    // soft breathing halo behind, shared by all variants
    const glow = (0.10 + 0.06 * (Math.sin(af * 0.16) + 1) / 2).toFixed(3);
    defs += `<radialGradient id="halo" cx="0.5" cy="0.46" r="0.5">` +
            `<stop offset="0" stop-color="${ring}" stop-opacity="${glow}"/>` +
            `<stop offset="1" stop-color="${ring}" stop-opacity="0"/></radialGradient>`;
    back += `<rect width="256" height="256" fill="url(#halo)"/>`;

    const variant = dropAnim || 'ripples';

    // variant: WAVE — drop outline filling with an oscillating water level
    if (variant === 'wave') {
      const ds = 31, dcx = CX, dcy = 116;
      const path = teardrop(dcx, dcy, ds);
      const top = dcy - ds * 2.05, bot = dcy + ds;
      const fillFrac = 0.46 + 0.24 * (Math.sin(af * 0.11) + 1) / 2;
      const level = bot - fillFrac * (bot - (top + 6));
      const amp = 4.2, wl = 30, ph = af * 0.42;
      const wave = (offset, lift) => {
        let d = `M${(dcx - ds - 4).toFixed(1)} ${(level - lift).toFixed(1)}`;
        for (let x = dcx - ds - 4; x <= dcx + ds + 4; x += 6) {
          const y = level - lift + amp * Math.sin((x - dcx) / wl + ph + offset);
          d += ` L${x.toFixed(1)} ${y.toFixed(1)}`;
        }
        return d + ` L${(dcx + ds + 4).toFixed(1)} ${(bot + 6).toFixed(1)} L${(dcx - ds - 4).toFixed(1)} ${(bot + 6).toFixed(1)} Z`;
      };
      // mask the wave overflow with a bg "donut" (square minus the teardrop) —
      // the deck rasterizer ignores <clipPath>, which would leak into a square.
      center =
        `<path d="${path}" fill="${mixHex(t.bg, ring, 0.10)}"/>` +
        `<path d="${wave(2.1, -3)}" fill="${ring}" opacity="0.35"/>` +
        `<path d="${wave(0, 0)}" fill="url(#dropg)"/>` +
        `<path d="M0 0 H256 V256 H0 Z ${path}" fill="${bg}" fill-rule="evenodd"/>` +
        `<path d="${path}" fill="none" stroke="${ring}" stroke-width="5" stroke-linejoin="round"/>` +
        `<ellipse cx="${(dcx - ds * 0.32).toFixed(1)}" cy="${(top + ds * 0.7).toFixed(1)}" rx="3.2" ry="6" fill="#FFFFFF" opacity="0.4" transform="rotate(-16 ${(dcx - ds * 0.32).toFixed(1)} ${(top + ds * 0.7).toFixed(1)})"/>`;
    }

    // variant: DROP — gentle "rain": slim drops fade in, fall with gravity into a
    // glossy pool; each impact a clean ripple + a small upward splash. Drops start
    // below the top edge and fade in so they never look clipped.
    else if (variant === 'drop') {
      const dcx = CX, poolY = 190, top = 60;
      defs += `<linearGradient id="poolg" x1="0" y1="0" x2="0" y2="1">` +
              `<stop offset="0" stop-color="${mixHex(ring, white, 0.30)}" stop-opacity="0.92"/>` +
              `<stop offset="1" stop-color="${mixHex(ring, '#000000', 0.22)}" stop-opacity="0.42"/></linearGradient>`;
      // glossy pool + specular highlight on the surface
      let s = `<rect x="0" y="${poolY}" width="256" height="${256 - poolY}" fill="url(#poolg)"/>` +
              `<line x1="${dcx - 52}" y1="${poolY + 2}" x2="${dcx + 52}" y2="${poolY + 2}" stroke="#FFFFFF" stroke-width="2" opacity="0.20" stroke-linecap="round"/>`;
      // evenly-staggered lanes (only ~one drop airborne at a time → uncluttered)
      const lanes = [
        { x: -50, ph: 0.00, sz: 9  },
        { x:   0, ph: 0.34, sz: 11 },
        { x:  50, ph: 0.67, sz: 8  }
      ];
      const N = 48;
      for (const ln of lanes) {
        const p = (((af) + ln.ph * N) % N) / N;
        const ds = ln.sz, x = dcx + ln.x;
        if (p < 0.74) {
          const fp = p / 0.74;
          const y = top + (poolY - top - ds * 1.4) * (fp * fp);       // gravity ease-in
          const fade = Math.min(1, fp / 0.16).toFixed(2);            // fade in (no pop/clip)
          const stretch = (1 + fp * 0.38).toFixed(2);
          if (fp > 0.28 && fp < 0.92) {                               // short motion streak
            s += `<line x1="${x}" y1="${(y - ds * 2.2).toFixed(1)}" x2="${x}" y2="${(y - ds * 3.4).toFixed(1)}" ` +
                 `stroke="${ring}" stroke-width="${(ds * 0.16).toFixed(1)}" opacity="${(0.18 * fp).toFixed(2)}" stroke-linecap="round"/>`;
          }
          s += `<g opacity="${fade}" transform="translate(0 ${(y - y * stretch).toFixed(1)}) scale(1 ${stretch})">` +
               `<path d="${teardrop(x, y, ds)}" fill="url(#dropg)"/>` +
               `<ellipse cx="${(x - ds * 0.32).toFixed(1)}" cy="${(y - ds * 0.12).toFixed(1)}" rx="${(ds * 0.17).toFixed(1)}" ry="${(ds * 0.3).toFixed(1)}" fill="#FFFFFF" opacity="0.3" transform="rotate(-16 ${(x - ds * 0.32).toFixed(1)} ${(y - ds * 0.12).toFixed(1)})"/>` +
               `</g>`;
        } else {
          const sp = (p - 0.74) / 0.26;                               // splash
          const rr = (ds * 0.5 + sp * ds * 2.6).toFixed(1);
          s += `<ellipse cx="${x}" cy="${poolY}" rx="${rr}" ry="${(rr * 0.3).toFixed(1)}" fill="none" ` +
               `stroke="${ring}" stroke-width="${(1.8 * (1 - sp) + 0.4).toFixed(2)}" opacity="${(0.5 * (1 - sp)).toFixed(2)}"/>`;
          const sy = (poolY - Math.sin(sp * Math.PI) * ds * 1.3).toFixed(1);
          const sr = (ds * 0.24 * (1 - sp * 0.5)).toFixed(1);
          const sop = (1 - sp).toFixed(2);
          s += `<circle cx="${(x - sp * ds * 0.9).toFixed(1)}" cy="${sy}" r="${sr}" fill="${ring}" opacity="${sop}"/>` +
               `<circle cx="${(x + sp * ds * 0.9).toFixed(1)}" cy="${sy}" r="${sr}" fill="${ring}" opacity="${sop}"/>`;
        }
      }
      center = s;
    }

    // variant: RIPPLES (default) — drop with pulsing concentric rings
    else {
      const period = 30;
      const bob = Math.sin(af * 0.16) * 3.2;
      const dCy = 118 + bob, dCx = CX, s = 30;
      let ripples = '';
      for (let k = 0; k < 3; k++) {
        const pp = ((af + k * (period / 3)) % period) / period;
        const rr = (30 + pp * 58).toFixed(1);
        const op = ((1 - pp) * 0.42).toFixed(3);
        const w  = (3.2 * (1 - pp * 0.5)).toFixed(2);
        ripples += `<circle cx="${dCx}" cy="${dCy.toFixed(1)}" r="${rr}" fill="none" stroke="${ring}" stroke-width="${w}" opacity="${op}"/>`;
      }
      const drop =
        `<path d="${teardrop(dCx, dCy, s)}" fill="url(#dropg)"/>` +
        `<ellipse cx="${(dCx - s * 0.34).toFixed(1)}" cy="${(dCy - s * 0.12).toFixed(1)}" rx="${(s * 0.20).toFixed(1)}" ry="${(s * 0.34).toFixed(1)}" ` +
        `fill="#FFFFFF" opacity="0.30" transform="rotate(-18 ${(dCx - s * 0.34).toFixed(1)} ${(dCy - s * 0.12).toFixed(1)})"/>`;
      center = ripples + drop;
    }
  }

  // ── IDLE / RUNNING — minimal ring + content ─────────────────────────
  else {
    const trackOp = dimmed ? '0.5' : '1';
    const ringOp  = dimmed ? '0.45' : '1';
    const progColor = flash ? white : ring;
    const rAnim = dimmed ? 'clean' : (ringAnim || 'clean');

    const trackRing = `<circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="${track}" stroke-width="${STROKE}" opacity="${trackOp}"/>`;
    const progArc = (stroke, op) =>
      `<circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="${stroke}" stroke-width="${STROKE}"` +
      ` stroke-dasharray="${RING_C.toFixed(1)}" stroke-dashoffset="${dash}" stroke-linecap="round"` +
      ` transform="rotate(-90 ${CX} ${CY})" opacity="${op}"/>`;

    if (rAnim === 'tide') {
      // ring as a water tank — level drains with the countdown, wavy surface
      const innerR = R - STROKE / 2 - 1;
      const lvlProg = (typeof waterLevel === 'number') ? waterLevel : progress;
      const level = CY + innerR - lvlProg * (2 * innerR);
      const amp = 3.6, wl = 26, ph = af * 0.5;
      const waveAt = (lift, off) => {
        let d = `M${(CX - innerR).toFixed(1)} ${(level - lift).toFixed(1)}`;
        for (let x = CX - innerR; x <= CX + innerR; x += 5) {
          const y = level - lift + amp * Math.sin((x - CX) / wl + ph + off);
          d += ` L${x.toFixed(1)} ${y.toFixed(1)}`;
        }
        return d + ` L${(CX + innerR).toFixed(1)} ${(CY + innerR + 4).toFixed(1)} L${(CX - innerR).toFixed(1)} ${(CY + innerR + 4).toFixed(1)} Z`;
      };
      defs += `<linearGradient id="tideg" x1="0" y1="0" x2="0" y2="1">` +
              `<stop offset="0" stop-color="${ring}" stop-opacity="0.42"/>` +
              `<stop offset="1" stop-color="${ring}" stop-opacity="0.16"/></linearGradient>`;
      // the deck rasterizer ignores <clipPath>, so the wave rect would spill into a
      // square. Instead draw the water, then mask the overflow with a bg "donut"
      // (full square minus the inner circle, even-odd) so only the circle shows.
      const r1 = innerR.toFixed(1), cxr = (CX + innerR).toFixed(1), cxl = (CX - innerR).toFixed(1);
      const hole = `M${cxr} ${CY} A${r1} ${r1} 0 1 1 ${cxl} ${CY} A${r1} ${r1} 0 1 1 ${cxr} ${CY} Z`;
      ringEls =
        `<path d="${waveAt(-4, 2.2)}" fill="${ring}" opacity="0.18"/>` +
        `<path d="${waveAt(0, 0)}" fill="url(#tideg)"/>` +
        `<path d="M0 0 H256 V256 H0 Z ${hole}" fill="${bg}" fill-rule="evenodd"/>` +
        trackRing +
        `<circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="${flash ? white : ring}" stroke-width="${STROKE}" opacity="${ringOp}"/>`;
    } else if (rAnim === 'flow') {
      // liquid shimmer — a slow sheen sweeps the arc + a soft breathing halo
      // (uses the eased waterLevel so the arc drains/refills smoothly, not dry)
      const lvlProg = (typeof waterLevel === 'number') ? waterLevel : progress;
      const fdash = (RING_C * (1 - lvlProg)).toFixed(1);
      const deg = (af * 1.6) % 360;
      defs += `<linearGradient id="flowg" gradientUnits="userSpaceOnUse" x1="${CX - R}" y1="${CY}" x2="${CX + R}" y2="${CY}" gradientTransform="rotate(${deg} ${CX} ${CY})">` +
              `<stop offset="0" stop-color="${ring}"/>` +
              `<stop offset="0.5" stop-color="${mixHex(ring, white, 0.5)}"/>` +
              `<stop offset="1" stop-color="${ring}"/></linearGradient>`;
      const s = (Math.sin(af * 0.28) + 1) / 2;
      const w = (STROKE + 2.6 * s).toFixed(2);
      const glowW = (STROKE + 12).toFixed(2);
      const glowOp = (0.10 + 0.12 * s).toFixed(3);
      const arc = (stroke, width, op) =>
        `<circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="${stroke}" stroke-width="${width}"` +
        ` stroke-dasharray="${RING_C.toFixed(1)}" stroke-dashoffset="${fdash}" stroke-linecap="round"` +
        ` transform="rotate(-90 ${CX} ${CY})" opacity="${op}"/>`;
      ringEls =
        trackRing +
        arc(ring, glowW, glowOp) +
        arc(flash ? white : 'url(#flowg)', w, ringOp);
    } else {
      ringEls = trackRing + progArc(progColor, ringOp);
    }

    if (dimmed) {
      // idle: small droplet falls; on impact the big drop POPS IN (shine) and
      // the splash ripples spread inside it.
      const N = 40;
      const p = (af % N) / N;
      const bcy = 100, s = 24;
      const path = teardrop(CX, bcy, s);
      let idle = '';
      if (p < 0.45) {
        const fp = p / 0.45;
        const dy = 26 + (bcy - 26) * (fp * fp);
        const dop = (0.9 * Math.min(1, fp / 0.3)).toFixed(2);
        idle = `<path d="${teardrop(CX, dy, 7)}" fill="${ring}" opacity="${dop}"/>`;
      } else {
        const rp = (p - 0.45) / 0.55;
        const appear = Math.min(1, 0.2 + rp / 0.14);
        const sc = (0.55 + 0.45 * appear).toFixed(3);
        defs += `<linearGradient id="dropshine" gradientUnits="userSpaceOnUse" x1="${CX - s}" y1="${bcy - s}" x2="${CX + s}" y2="${bcy + s}" gradientTransform="rotate(${(af * 2.6) % 360} ${CX} ${bcy})">` +
                `<stop offset="0" stop-color="${ring}"/>` +
                `<stop offset="0.5" stop-color="${mixHex(ring, white, 0.75)}"/>` +
                `<stop offset="1" stop-color="${ring}"/></linearGradient>`;
        let rips = '';
        for (let k = 0; k < 2; k++) {
          const pp = rp - k * 0.4;
          if (pp > 0 && pp < 1) {
            const rr = (pp * s * 1.7).toFixed(1);
            const op = ((1 - pp) * 0.6).toFixed(2);
            rips += `<circle cx="${CX}" cy="${bcy}" r="${rr}" fill="none" stroke="${mixHex(ring, white, 0.45)}" stroke-width="2.5" opacity="${op}"/>`;
          }
        }
        idle =
          `<g transform="translate(${CX} ${bcy}) scale(${sc}) translate(${-CX} ${-bcy})" opacity="${appear.toFixed(2)}">` +
            `<path d="${path}" fill="${ring}" opacity="0.10"/>` +
            `${rips}` +
            `<path d="${path}" fill="none" stroke="url(#dropshine)" stroke-width="6" stroke-linejoin="round"/>` +
          `</g>`;
      }
      center = idle;
    } else {
      const digitFill = flash ? ring : white;
      center = glyphSVG(font, timeStr, CX, CY, 54, digitFill, '1');
    }
  }

  // ── label ───────────────────────────────────────────────────────────
  const labelColor = isDone ? white : (flash ? white : ring);
  const labelEl = displayLabel
    ? `<text x="${CX}" y="${labelY}" text-anchor="middle" fill="${labelColor}"
        font-size="19" font-weight="bold" font-family="Arial, Helvetica, sans-serif"
        letter-spacing="4" opacity="${dimmed ? '0.6' : '1'}">${displayLabel}</text>`
    : '';

  // ── progress dots (water glasses) ───────────────────────────────────
  const max = Math.min(dailyGoal, 12);
  const gap = 18;
  const x0 = CX - ((max - 1) * gap) / 2;
  let dots = '';
  if (!isDone) for (let i = 0; i < max; i++) {
    const filled = isDone || i < currentAmount;
    const fill = filled ? (flash && !isDone ? white : ring) : track;
    const op = filled ? '1' : '0.6';
    dots += `<circle cx="${(x0 + i * gap).toFixed(0)}" cy="234" r="4.5" fill="${fill}" opacity="${op}"/>`;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  ${defs ? `<defs>${defs}</defs>` : ''}
  <rect width="256" height="256" fill="${bg}"/>
  ${back}
  ${ringEls}
  ${center}
  ${labelEl}
  ${dots}
</svg>`;

  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
}

// ── Controller ──────────────────────────────────────────────────────────────
class HydroTracker {
  constructor(context, $UD) {
    this.$UD     = $UD;
    this.context = context;

    this.config = {
      ageGroup: 'adult',
      weight: 70,
      weightUnit: 'kg',
      containerSize: 250,
      containerUnit: 'ml',
      notify: true,
      hotWeather: false,        // verão / muito calor → +15% de meta
      quietEnabled: false,      // silêncio noturno
      quietStart: 22,           // hora de início (0–23)
      quietEnd: 7,              // hora de fim (0–23)
      theme: 'ocean',
      font: 'sans',
      dropAnim: 'ripples',
      ringAnim: 'clean',
      // reminder pace — a full container isn't drunk in one go, so long gaps are
      // split into sip-sized reminders (each ≤ the pace's target minutes). Values:
      // frequent(~30) | balanced(~45) | relaxed(~60) | container(one drink/container).
      reminderPace: 'balanced',
      notifyTitle: 'Hydro Tracker',
      msgDrinkWater: 'Time to drink water! Stay hydrated.',
      msgGoalReached: 'Daily hydration goal reached! Great job!',
      labelIdle: 'HYDRATE', labelRunning: 'DRINK', labelAlert: 'DRINK!', labelDone: 'DONE'
    };

    this.dailyGoal    = 8;
    this.totalTime    = 60 * 60;
    this.timeLeft     = this.totalTime;
    this.currentAmount = 0;
    this.sipsPerGlass = 1;    // reminders per container (auto from the reminder pace)
    this.sipInGlass   = 0;    // sips taken toward the current container

    this.phase        = 'idle';    // idle | running | alert | done
    this.running      = false;
    this.animFrame    = 0;
    this.blinkOn      = false;
    this.waterLevel   = 1;         // eased 0..1 tank level for the 'tide' ring

    this.clockTimer   = null;
    this.animTimer    = null;
    this.blinkTimer   = null;
    this.doneTimer    = null;

    this.recalculateMath();
    this.render();
    this._startIdleAnim();
  }

  setConfig(param) {
    if (!param) return;
    if (param.resetProgress) { this.reset(); return; }

    if (param.ageGroup) this.config.ageGroup = param.ageGroup;
    if (param.weight) this.config.weight = parseFloat(param.weight);
    if (param.weightUnit) this.config.weightUnit = param.weightUnit;
    if (param.containerSize) this.config.containerSize = parseFloat(param.containerSize);
    if (param.containerUnit) this.config.containerUnit = param.containerUnit;
    if (param.notify !== undefined) {
      this.config.notify = param.notify === true || param.notify === 'true' || param.notify === 'on';
    }
    if (param.hotWeather !== undefined) {
      this.config.hotWeather = param.hotWeather === true || param.hotWeather === 'true' || param.hotWeather === 'on';
    }
    if (param.quietEnabled !== undefined) {
      this.config.quietEnabled = param.quietEnabled === true || param.quietEnabled === 'true' || param.quietEnabled === 'on';
    }
    if (param.quietStart !== undefined) this.config.quietStart = parseInt(param.quietStart, 10);
    if (param.quietEnd !== undefined)   this.config.quietEnd   = parseInt(param.quietEnd, 10);
    if (param.theme) this.config.theme = param.theme;
    if (param.font)  this.config.font  = param.font;
    if (param.dropAnim) this.config.dropAnim = param.dropAnim;
    if (param.ringAnim) this.config.ringAnim = param.ringAnim;
    if (param.reminderPace) this.config.reminderPace = param.reminderPace;

    const strFields = ['notifyTitle', 'msgDrinkWater', 'msgGoalReached',
                       'labelIdle', 'labelRunning', 'labelAlert', 'labelDone'];
    for (const f of strFields) { if (param[f]) this.config[f] = param[f]; }

    if (this.config.notifyTitle && this.config.notifyTitle !== _lastEnsuredTitle) {
      ensureWinIdentity(this.config.notifyTitle);
    }

    this.recalculateMath();
  }

  // True while inside the user's quiet-hours window (notifications suppressed).
  _inQuietHours() {
    if (!this.config.quietEnabled) return false;
    const s = this.config.quietStart, e = this.config.quietEnd;
    if (!Number.isFinite(s) || !Number.isFinite(e) || s === e) return false;
    const h = new Date().getHours();
    return s < e ? (h >= s && h < e) : (h >= s || h < e); // wraps past midnight
  }

  // Only notify when enabled AND not silenced by quiet hours.
  _notify(msg, icon) {
    if (this.config.notify && !this._inQuietHours()) {
      notifyOS(this.config.notifyTitle, msg, icon);
    }
  }

  recalculateMath() {
    const weightKg = this.config.weightUnit === 'lbs' ? this.config.weight / 2.20462 : this.config.weight;
    const mlPerKg = this.config.ageGroup === 'child' ? 50 : 35;
    let totalMl = weightKg * mlPerKg;
    if (this.config.hotWeather) totalMl *= 1.15;   // verão / muito calor
    const containerMl = this.config.containerUnit === 'oz' ? this.config.containerSize * 29.5735
                      : this.config.containerUnit === 'l'  ? this.config.containerSize * 1000
                      : this.config.containerSize;

    const newGoal = Math.max(1, Math.ceil(totalMl / containerMl));
    const activeMinutes = 16 * 60;
    const glassInterval = activeMinutes / newGoal; // minutes to finish ONE container

    // A container is sipped, not chugged: split long gaps into sip-sized reminders so
    // the countdown no longer scales with container size (500 mL used to mean a 192-min
    // wait). Each reminder targets ≤ pace minutes; each key press = one sip; a container
    // (dot) fills after all its sips.
    const PACE_MAX = { frequent: 30, balanced: 45, relaxed: 60, container: Infinity };
    const paceMax = PACE_MAX[this.config.reminderPace] != null ? PACE_MAX[this.config.reminderPace] : 45;
    const sips = Math.max(1, Math.min(6, Math.ceil(glassInterval / paceMax)));
    const intervalMinutes = Math.max(1, Math.round(glassInterval / sips));

    this.dailyGoal = newGoal;
    if (this.sipsPerGlass !== sips) {
      this.sipsPerGlass = sips;
      if (this.sipInGlass >= sips) this.sipInGlass = 0;
    }

    const newTotalTime = intervalMinutes * 60;
    if (this.totalTime !== newTotalTime) {
      this.totalTime = newTotalTime;
      if (this.phase === 'idle' || this.timeLeft > this.totalTime) {
        this.timeLeft = this.totalTime;
      }
    }

    if (this.phase === 'running') { this._stopAnim(); this._startRunAnim(); }
    this.render();
  }

  drinkWater() {
    // If already done for the day, dismiss
    if (this.phase === 'done') { this._finishDone(); return; }

    this._stopBlink();
    this._stopAnim();   // stop any alert ripple animation

    // each press = one sip; a container (dot) fills after all its sips
    this.sipInGlass++;
    if (this.sipInGlass >= this.sipsPerGlass) { this.sipInGlass = 0; this.currentAmount++; }

    if (this.currentAmount >= this.dailyGoal) {
      // Goal reached! Play the hydration-complete celebration
      this._notify(this.config.msgGoalReached, NOTIFY_ICONS.goal);
      this._stopTimer();
      this.phase   = 'done';
      this.running = false;
      this.blinkOn = false;
      this.animFrame = 0;
      // smooth "filled up with water" animation for ~6s, then reset
      this.animTimer = setInterval(() => { this.animFrame++; this.render(); }, 100);
      this.doneTimer = setTimeout(() => this._finishDone(), 6000);
      this.render();
      return;
    }

    // Reset countdown for next glass
    this.timeLeft = this.totalTime;
    this.phase    = 'running';
    this.running  = true;
    this._startTimer();
    this.render();
  }

  reset() {
    this._stopTimer();
    this._stopBlink();
    this._stopAnim();
    if (this.doneTimer) { clearTimeout(this.doneTimer); this.doneTimer = null; }
    this.currentAmount = 0;
    this.sipInGlass    = 0;
    this.phase         = 'idle';
    this.running       = false;
    this.timeLeft      = this.totalTime;
    this.render();
    this._startIdleAnim();
  }

  _finishDone() {
    if (this.doneTimer) { clearTimeout(this.doneTimer); this.doneTimer = null; }
    this.reset();
  }

  // ── ticking ──
  // Countdown ticks once a second. A light animation loop runs only when an
  // animated water ring (flow/tide) is selected; 'clean' stays static (no CPU).
  _startTimer() {
    this._stopTimer();
    this.clockTimer = setInterval(() => this._tick(), 1000);
    this._startRunAnim();
  }
  _stopTimer() {
    if (this.clockTimer) { clearInterval(this.clockTimer); this.clockTimer = null; }
    this._stopAnim();
  }

  _startRunAnim() {
    if (this.animTimer || this.phase !== 'running') return;
    const ra = this.config.ringAnim;
    if (ra !== 'flow' && ra !== 'tide') return;
    this.animTimer = setInterval(() => { this.animFrame++; this._easeWater(); this.render(); }, 160);
  }

  // Gentle dripping animation while idle (waiting to start the day).
  _startIdleAnim() {
    if (this.animTimer || this.phase !== 'idle') return;
    // ~4.5 fps — gentle idle drip; low rate keeps a resting key light on CPU
    this.animTimer = setInterval(() => { this.animFrame++; this.render(); }, 220);
  }

  // Ease the tank level toward the real countdown ratio so the tide both drains
  // and refills smoothly (harmonic transition each cycle) instead of jumping.
  _easeWater() {
    const target = this.totalTime > 0 ? Math.max(0, Math.min(1, this.timeLeft / this.totalTime)) : 1;
    this.waterLevel += (target - this.waterLevel) * 0.16;
    if (Math.abs(target - this.waterLevel) < 0.002) this.waterLevel = target;
  }

  _stopAnim() {
    if (this.animTimer) { clearInterval(this.animTimer); this.animTimer = null; }
  }

  _tick() {
    if (this.timeLeft <= 0) return;
    this.timeLeft--;

    if (this.timeLeft <= BLINK_AT && this.timeLeft > 0) {
      this._startBlink();
    } else if (this.timeLeft <= 0) {
      this._onTimeout();
      return;
    }
    this.render();
  }

  _startBlink() {
    if (this.blinkTimer) return;
    this.blinkOn = true;
    this.render();
    this.blinkTimer = setInterval(() => { this.blinkOn = !this.blinkOn; this.render(); }, 400);
  }
  _stopBlink() {
    if (this.blinkTimer) { clearInterval(this.blinkTimer); this.blinkTimer = null; }
    this.blinkOn = false;
  }

  _onTimeout() {
    this._stopTimer();
    this._stopBlink();
    this._notify(this.config.msgDrinkWater, NOTIFY_ICONS.water);
    this.phase   = 'alert';
    this.running = false;
    this.blinkOn = false;
    this.animFrame = 0;
    // smooth water-drop ripple animation prompting the user to drink
    this._stopAnim();
    this.animTimer = setInterval(() => {
      this.animFrame++;
      this.render();
    }, 130);
  }

  // ── render ──
  render() {
    const L = this.config;
    let displayLabel;
    if      (this.phase === 'done')  displayLabel = L.labelDone;
    else if (this.phase === 'alert') displayLabel = L.labelAlert;
    else if (this.phase === 'idle')  displayLabel = L.labelIdle;
    else                             displayLabel = L.labelRunning;
    displayLabel = displayLabel || PHASE_LABELS_DEFAULT[this.phase] || 'HYDRATE';

    const dimmed = this.phase === 'idle';

    try {
      const svg = generateSVG({
        timeLeft:      this.timeLeft,
        totalTime:     this.totalTime,
        phase:         this.phase,
        displayLabel,
        flash:         this.blinkOn,
        dimmed,
        currentAmount: this.currentAmount,
        dailyGoal:     this.dailyGoal,
        theme:         this.config.theme,
        font:          this.config.font,
        dropAnim:      this.config.dropAnim,
        ringAnim:      this.config.ringAnim,
        waterLevel:    this.waterLevel,
        animFrame:     this.animFrame,
        running:       this.running || this.phase === 'alert'
      });
      if (svg === this._lastSvg) return; // skip redundant WS pushes (no visual change)
      this._lastSvg = svg;
      this.$UD.setBaseDataIcon(this.context, svg);
    } catch (e) {
      console.error('[Hydro] render error:', e.message);
    }
  }

  destroy() {
    this._stopTimer();
    this._stopBlink();
    if (this.doneTimer) { clearTimeout(this.doneTimer); this.doneTimer = null; }
  }
}

// ── Bootstrap ───────────────────────────────────────────────────────────────
const $UD           = new UlanzideckApi();
const ACTION_CACHES = {};

$UD.connect('com.hydro.tracker.deck');
$UD.onConnected(() => bootLog('connected to Ulanzi'));
$UD.onError((e) => console.error('[Hydro] Error:', typeof e === 'string' ? e : ''));

// One live instance per action. Moving a key changes its context (position), so
// without this the old instance keeps its animation timer and both render to the
// same key → the water drop flickers. Drop any stale instance for the same action.
function dropStaleFor(ctx) {
  let actionid;
  try { actionid = $UD.decodeContext(ctx).actionid; } catch (e) { return; }
  if (!actionid) return;
  for (const k of Object.keys(ACTION_CACHES)) {
    if (k === ctx) continue;
    let a; try { a = $UD.decodeContext(k).actionid; } catch (e) { continue; }
    if (a === actionid) { ACTION_CACHES[k].destroy(); delete ACTION_CACHES[k]; }
  }
}

$UD.onAdd((jsn) => {
  const ctx = jsn.context;
  dropStaleFor(ctx); // clear a previous placement of this same action (moved key)
  if (!ACTION_CACHES[ctx]) ACTION_CACHES[ctx] = new HydroTracker(ctx, $UD);
  if (jsn.param) ACTION_CACHES[ctx].setConfig(jsn.param);
});

$UD.onParamFromApp((jsn) => {
  const inst = ACTION_CACHES[jsn.context];
  if (inst && jsn.param) inst.setConfig(jsn.param);
});

$UD.onParamFromPlugin((jsn) => {
  const inst = ACTION_CACHES[jsn.context];
  if (inst && jsn.param) inst.setConfig(jsn.param);
});

$UD.onRun((jsn) => {
  const ctx = jsn.context;
  if (!ACTION_CACHES[ctx]) { dropStaleFor(ctx); ACTION_CACHES[ctx] = new HydroTracker(ctx, $UD); }
  ACTION_CACHES[ctx].drinkWater();
});

$UD.onSetActive((jsn) => {
  const inst = ACTION_CACHES[jsn.context];
  if (inst) inst.render();
});

$UD.onClear((jsn) => {
  if (!jsn.param) return;
  for (const item of jsn.param) {
    const inst = ACTION_CACHES[item.context];
    if (inst) { inst.destroy(); delete ACTION_CACHES[item.context]; }
  }
});
