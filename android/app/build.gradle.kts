import groovy.json.JsonSlurper

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// the version is the desktop app's (wails.json at the repository root)
val repoRoot: File = rootDir.parentFile
@Suppress("UNCHECKED_CAST")
val appVersion = ((JsonSlurper().parse(repoRoot.resolve("wails.json")) as Map<String, Any>)["info"] as Map<String, String>)["productVersion"]
    ?: "0.0.0"

android {
    namespace = "io.github.peranika.poruneko"
    compileSdk = 35

    defaultConfig {
        applicationId = "io.github.peranika.poruneko"
        minSdk = 30
        targetSdk = 35
        versionName = appVersion
        versionCode = appVersion.split(".").map { it.toIntOrNull() ?: 0 }.let { (it + listOf(0, 0, 0)).take(3) }
            .fold(0) { acc, n -> acc * 1000 + n }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // signed with the debug key until a release key is set up
            signingConfig = signingConfigs.getByName("debug")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}
