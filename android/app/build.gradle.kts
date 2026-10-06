import groovy.json.JsonSlurper
import org.gradle.internal.os.OperatingSystem

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// the repository root: the Go backend and the frontend are the desktop app's own
val repoRoot: File = rootDir.parentFile

// the version is the desktop app's (wails.json)
@Suppress("UNCHECKED_CAST")
val appVersion = ((JsonSlurper().parse(repoRoot.resolve("wails.json")) as Map<String, Any>)["info"] as Map<String, String>)["productVersion"]
    ?: "0.0.0"

android {
    namespace = "io.github.peranika.poruneko"
    compileSdk = 35
    ndkVersion = "29.0.14206865"

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
    packaging {
        // the Go backend is run as a program, so it has to be a file in the native library folder
        jniLibs.useLegacyPackaging = true
    }
    sourceSets["main"].jniLibs.srcDir(layout.buildDirectory.dir("go/jniLibs"))
}

// ---------------------------------------------------------------- The Go backend and the frontend

val windows = OperatingSystem.current().isWindows

// the frontend is embedded in the Go program, so it is built first
val buildFrontend by tasks.registering(Exec::class) {
    workingDir = repoRoot.resolve("frontend")
    if (windows) commandLine("cmd", "/c", "npm", "run", "build") else commandLine("npm", "run", "build")
}

// the ABIs the Go backend is built for: -Pabis=arm64-v8a to build only one (x86_64 is for the emulator)
val goAbis = mapOf("arm64-v8a" to ("arm64" to "aarch64"), "x86_64" to ("amd64" to "x86_64"))
val abis = (findProperty("abis") as String?)?.split(",")?.map { it.trim() } ?: goAbis.keys.toList()

val buildGo by tasks.registering {
    group = "build"
    description = "Builds the Go backend for each ABI"
}

for (abi in abis) {
    val (goArch, clangArch) = goAbis[abi] ?: error("unknown ABI $abi")
    val task = tasks.register<Exec>("buildGo-$abi") {
        dependsOn(buildFrontend)
        val host = when {
            windows -> "windows-x86_64"
            OperatingSystem.current().isMacOsX -> "darwin-x86_64"
            else -> "linux-x86_64"
        }
        val clang = android.ndkDirectory.resolve("toolchains/llvm/prebuilt/$host/bin/$clangArch-linux-android30-clang" + if (windows) ".cmd" else "")
        val out = layout.buildDirectory.file("go/jniLibs/$abi/libporuneko.so").get().asFile
        workingDir = repoRoot
        environment("GOOS", "android")
        environment("GOARCH", goArch)
        environment("CGO_ENABLED", "1")
        environment("CC", clang.absolutePath)
        commandLine("go", "build", "-trimpath", "-ldflags=-s -w", "-o", out.absolutePath, ".")
    }
    buildGo.configure { dependsOn(task) }
}

tasks.named("preBuild") { dependsOn(buildGo) }
