# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing any code.

Note: this project intentionally pins Expo SDK 54, three lines behind the newest SDK 57 (as of this
writing), because the team's physical test device only has an Expo Go build that supports up to
SDK 54 — newer SDKs (55/56/57) all showed "Project is incompatible with this version of Expo Go" on
that device. Before upgrading past 54, confirm what SDK the team's actual Expo Go installs support,
not just what's newest on npm.

Also note: `node_modules/@react-native/gradle-plugin/settings.gradle.kts` pins
`org.gradle.toolchains.foojay-resolver-convention` at a version that can be too old for the Gradle
version the Expo prebuild template selects, causing `assembleRelease` to fail immediately with
`Class org.gradle.jvm.toolchain.JvmVendorSpec does not have member field ... IBM_SEMERU`. If a local
native Android build hits that error, bump the plugin version in that file to the latest published
release (check https://plugins.gradle.org/plugin/org.gradle.toolchains.foojay-resolver-convention).
This edit lives in node_modules so it does not survive a reinstall — it must be reapplied each time.
