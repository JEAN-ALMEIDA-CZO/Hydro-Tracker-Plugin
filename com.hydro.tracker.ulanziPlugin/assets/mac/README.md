# macOS notifications — custom name + icon

On macOS the notification banner's **app name and icon** come from the *bundle that
posts it*, not from a parameter. `osascript` posts as **Script Editor**, so it can't
show "Hydro Tracker" + a custom icon. To match the Windows experience, the plugin
will use a bundled **`terminal-notifier.app`** if it finds one here:

```
assets/mac/terminal-notifier.app/Contents/MacOS/terminal-notifier
```

`plugin/app.js` → `notifyOS()` automatically prefers this bundle (then Homebrew /
PATH copies), falling back to `osascript` if none is found. It calls:

```
terminal-notifier -title "<plugin name>" -message "<message>" \
                  -sound Glass -contentImage <assets/icons/notify_*.png>
```

So `-contentImage` already shows the per-event droplet icon (`notify_water.png` for the
drink reminder, `notify_goal.png` when the daily goal is reached). The **top-left
attribution** (name + small icon) is whatever the bundle's `CFBundleName` +
`AppIcon.icns` are.

---

## Steps (run on a Mac)

`terminal-notifier` is MIT-licensed and open source:
https://github.com/julienXX/terminal-notifier

1. **Get the app bundle**

   ```sh
   brew install terminal-notifier
   cp -R "$(brew --prefix)/Caskroom"/.../terminal-notifier.app .   # or download a release
   ```

2. **Rebrand it** — edit `terminal-notifier.app/Contents/Info.plist`:

   ```xml
   <key>CFBundleName</key>           <string>Hydro Tracker</string>
   <key>CFBundleDisplayName</key>    <string>Hydro Tracker</string>
   <key>CFBundleIdentifier</key>     <string>com.hydro.tracker.notifier</string>
   ```

3. **Replace the icon** — convert the bundled droplet `assets/icons/notify_water.png`
   to `.icns` and overwrite `Contents/Resources/Terminal.icns` (match the name in
   `CFBundleIconFile`):

   ```sh
   mkdir icon.iconset
   sips -z 512 512 notify_water.png --out icon.iconset/icon_512x512.png
   # …generate the other sizes (16,32,128,256,512 @1x/@2x)…
   iconutil -c icns icon.iconset -o AppIcon.icns
   cp AppIcon.icns terminal-notifier.app/Contents/Resources/Terminal.icns
   ```

4. **Re-sign** (modifying a signed app invalidates its signature)

   - Local/testing (ad-hoc):
     ```sh
     codesign --force --deep --sign - terminal-notifier.app
     ```
   - Distribution (recommended): sign with a **Developer ID Application** cert and
     **notarize** so Gatekeeper accepts it on other Macs:
     ```sh
     codesign --force --deep --options runtime \
       --sign "Developer ID Application: <Your Name> (<TEAMID>)" terminal-notifier.app
     xcrun notarytool submit terminal-notifier.zip --apple-id … --team-id … --wait
     xcrun stapler staple terminal-notifier.app
     ```

5. **Drop it here** as `assets/mac/terminal-notifier.app`. Done — notifications now
   show **Hydro Tracker** + the custom droplet icon.

> Without step 4 (signing), macOS may block the helper or require manual approval in
> System Settings → Privacy & Security / Notifications. Ad-hoc signing is fine for
> internal validation; Developer ID + notarization is required for public release.

---

## Fallback

If `assets/mac/terminal-notifier.app` is absent, the plugin still notifies via
`osascript` (title correct, generic attribution) — nothing breaks. No native binary
is shipped by default, so the plugin stays fully cross-platform and store-compliant.
