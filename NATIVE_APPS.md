# AgriLumina native apps

The existing React application is packaged with Capacitor 8.6.2 for Android and iOS; the website uses the same source. Generated native projects are in `android/` and `ios/`. App plugin 8.1.2 supplies native URL/lifecycle/back-button events. No rewrite or separate scientific engine was introduced.

```powershell
npm ci
npm run native:sync
npm run native:android
# On macOS:
npm run native:ios
```

The sync command rebuilds `dist` and copies it into both native projects. Edit shared screens under `src/`; native public folders are generated/ignored. Session refresh follows native resume/pause, Android back follows WebView history, and registered `terrawise://auth/login` and `terrawise://auth/update-password` callbacks accept only those app routes. Tokens are never logged. Provider redirect configuration and device validation are release prerequisites.

Native project generation and synchronization passed on Windows. Android debug compilation stopped at missing Java/JAVA_HOME; iOS compilation requires macOS/Xcode. There are no signed or device-verified APK, AAB or IPA artifacts. File downloads/printing, permissions, secure session storage review, launch artwork, signing and store acceptance remain device release work. See [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md).

Primary platform instructions: [Capacitor installation](https://capacitorjs.com/docs/getting-started), [environment setup](https://capacitorjs.com/docs/getting-started/environment-setup), [Android](https://capacitorjs.com/docs/android), [iOS](https://capacitorjs.com/docs/ios).
