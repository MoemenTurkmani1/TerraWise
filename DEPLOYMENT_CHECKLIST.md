# AgriLumina deployment checklist

12 November 2026. The shared React/Vite app now also has generated Capacitor Android and iOS projects. This checklist does not authorize deployment, migrations, changes to production records or provider settings.

## Website staging

- [ ] Choose the hosting project and final domain. Build with `npm ci` and `npm run build`; publish only `dist`.
- [ ] Configure SPA fallback to `/index.html` for application routes. Verify direct visits/reloads at `/fields/new`, `/history`, `/recommendations`, `/login` and `/update-password` on the actual host.
- [ ] Set only the intended public Supabase URL and publishable/anon key in the build environment. Never expose privileged or AI-provider keys. Confirm `.env.local` and signing files are excluded from uploads.
- [ ] Serve HTTPS. Review caching: hashed assets can be immutable; `index.html`, `sw.js` and `offline-assets.json` must revalidate. Verify a previous installation updates its app shell.
- [ ] Review CSP/security headers with NASA POWER, Supabase, map tiles and required resources. Verify recovery redirects match the final origin before enabling public accounts.
- [ ] Run `npm test`, `npm run typecheck`, `npm run build`, production browser QA, synthetic account QA and demo isolation QA.
- [ ] Check actual-host API errors, offline states, keyboard use, narrow screens, print/export and recoverable storage failures.
- [ ] Obtain owner approval before publishing staging or production.

## Public account release gates

- [ ] Independently verify real signup/confirmation, login/logout, recovery and refresh in a disposable test project, then perform authorized read-only checks on the intended project.
- [ ] Execute direct owner/cross-owner API persistence and isolation tests only with disposable records in a disposable project. Review effective RLS/grants. Do not infer server isolation from client filters or synthetic tests.
- [ ] Confirm backup/restore, retention, account deletion/support, privacy/legal text and incident ownership. Cloud soil reports remain unsupported.
- [ ] Existing optional AI Agronomist requires separate provider/function configuration and hosted verification; do not label it verified from its synthetic tests or deploy a function implicitly.

## Native Android and iOS

- [ ] Confirm ownership/availability of the provisional bundle identifier `com.terrawise.app` and replace it consistently if necessary before distribution.
- [ ] Run `npm run native:sync` after every web release. Bundled assets are generated and ignored by Git; no development server URL is configured.
- [ ] Android: install the compatible Android Studio/JDK/SDK versions required by the installed Capacitor 8 packages; set `JAVA_HOME` and SDK configuration. Build with `android/gradlew -p android assembleDebug` or Android Studio. The build attempt here stopped because Java was unavailable; no APK/AAB was produced.
- [ ] iOS: use macOS with supported Xcode and resolve Swift Package Manager dependencies; open the generated project with `npm run native:ios`. Compile on simulator and physical iPhone/iPad. No iOS compilation/signing was possible on this Windows host.
- [ ] In the intended auth project's redirect allowlist, review `terrawise://auth/login` and `terrawise://auth/update-password`. These callbacks are registered in both native projects; provider settings were not changed. Test cold-start and running-app confirmation/recovery, expired links and session persistence on devices.
- [ ] Review native session storage, app backups and shared-device exposure. Android automatic backup is disabled; authentication remains in the platform WebView's persistent storage. No hardware-backed secure-storage claim is made.
- [ ] Test native permission handling for location, file selection, exports/printing, external links, keyboard, safe areas, app resume and Android back. Browser tests do not establish WebView/device compatibility.
- [ ] Replace generated launcher/splash artwork, confirm privacy descriptions and app-store privacy declarations, set release signing/versioning and run device acceptance before creating signed builds.
- [ ] Obtain explicit approval before signing/uploading to store testing tracks or releasing publicly. No stores or hosting services were contacted for publication.

## Scientific product boundaries

- [ ] Keep pH/temperature indices explicitly provisional and limited to two factors. Overall suitability and water suitability remain unknown without complete reviewed evidence.
- [ ] ETo and standard-condition wheat ETc require complete daily inputs/profile coverage. Do not fill unsupported radiation days, infer effective rain or equate standard ETc with actual stressed ET.
- [ ] Do not ship generated demo results as farmer measurements or verified NASA recommendations. Demo mode must remain isolated and marked synthetic in UI, persistence and exports.
- [ ] Local agronomic review and validation remain required before operational planting advice. Native packaging does not change these limits.
