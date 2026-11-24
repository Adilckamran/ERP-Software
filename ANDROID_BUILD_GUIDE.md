# Fruity Fun Juice Factory — Android APK Build & Distribution Guide (`ANDROID_BUILD_GUIDE.md`)

## Application Identity
- **App Name**: Fruity Fun Juice Factory
- **Application ID**: `pk.fruityfun.erp.booker`
- **Source Location**: [`apps/android`](apps/android)
- **Minimum SDK**: Android 8.0 (API 26) | **Target SDK**: Android 15 (API 35)

## Key Native Components
1. [`AndroidManifest.xml`](apps/android/app/src/main/AndroidManifest.xml): Declares `ACCESS_FINE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE`, and `FOREGROUND_SERVICE_LOCATION`.
2. [`LocationTrackingForegroundService.kt`](apps/android/app/src/main/java/pk/fruityfun/erp/booker/location/LocationTrackingForegroundService.kt): Persistent Foreground Service that tracks Booker GPS coordinates only during authorized working hours while duty is active, queues points offline in SQLite during network drops, and syncs with `/api/erp`.
3. [`MainActivity.kt`](apps/android/app/src/main/java/pk/fruityfun/erp/booker/MainActivity.kt): Native Android mobile UI implementing all 12 Booker screens for Fruity Fun Juice Factory.

## Building a Signed Release APK
1. Generate a private upload/release keystore outside the repository (never commit `.jks` files):
   ```bash
   keytool -genkey -v -keystore ~/juice-factory-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias juice-factory-key
   ```
2. Set the environment variables before running Gradle:
   ```bash
   export ANDROID_KEYSTORE_PATH="$HOME/juice-factory-release.jks"
   export ANDROID_KEYSTORE_PASSWORD="<your-keystore-password>"
   export ANDROID_KEY_ALIAS="juice-factory-key"
   export ANDROID_KEY_PASSWORD="<your-key-password>"
   ```
3. Build the signed release APK:
   ```bash
   cd apps/android
   ./gradlew assembleRelease
   ```
4. Distribute `apps/android/app/build/outputs/apk/release/app-release.apk` privately to booker devices. Always retain the same `.jks` keystore so future updates install seamlessly without data loss.
