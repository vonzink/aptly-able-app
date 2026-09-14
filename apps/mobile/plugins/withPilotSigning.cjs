/* global require, module */
// Expo loads local config plugins as CommonJS.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { withAppBuildGradle, withDangerousMod } = require('expo/config-plugins');

module.exports = function withPilotSigning(config) {
  config = withAppBuildGradle(config, (result) => {
    const start = '// BEGIN Aptly private release signing';
    const end = '// END Aptly private release signing';
    const block = `${start}
def pilotStore = System.getenv('APTLY_PILOT_KEYSTORE')
def pilotPassword = System.getenv('APTLY_PILOT_STORE_PASSWORD')
def pilotAlias = System.getenv('APTLY_PILOT_KEY_ALIAS')
def pilotKeyPassword = System.getenv('APTLY_PILOT_KEY_PASSWORD')
def pilotSigningReady = pilotStore && pilotPassword && pilotAlias && pilotKeyPassword && file(pilotStore).exists()
android {
    signingConfigs {
        pilot {
            if (pilotSigningReady) {
                storeFile file(pilotStore)
                storePassword pilotPassword
                keyAlias pilotAlias
                keyPassword pilotKeyPassword
            }
        }
    }
    buildTypes.release.signingConfig = signingConfigs.pilot
}
gradle.taskGraph.whenReady { graph ->
    if (graph.allTasks.any { it.project == project && it.name.toLowerCase().contains('release') } && !pilotSigningReady) {
        throw new GradleException('Private release signing is missing. Use scripts/android-pilot.mjs.')
    }
}
// The public API origin is an environment input; rebuild the bundle on each release.
tasks.configureEach { task ->
    if (task.name == 'createBundleReleaseJsAndAssets') task.outputs.upToDateWhen { false }
}
${end}`;
    const old = result.modResults.contents;
    const first = old.indexOf(start);
    result.modResults.contents =
      first >= 0
        ? old.slice(0, first) + block + old.slice(old.indexOf(end, first) + end.length)
        : old + '\n' + block + '\n';
    return result;
  });
  return withDangerousMod(config, [
    'android',
    async (result) => {
      const { rm } = await import('node:fs/promises');
      const { join } = await import('node:path');
      // These generated files retain the previous package when switching preview/native.
      // Invalidate only autolinking outputs; preserve all Android source and native caches.
      for (const relative of ['build/generated/autolinking', 'app/build/generated/autolinking']) {
        await rm(join(result.modRequest.platformProjectRoot, relative), {
          recursive: true,
          force: true,
        });
      }
      return result;
    },
  ]);
};
