/* global require, module, process, URL */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { withInfoPlist, withXcodeProject } = require('expo/config-plugins');

module.exports = function withStoreReadiness(config) {
  config = withInfoPlist(config, (result) => {
    // SecureStore uses Keychain without biometric authentication in this app.
    delete result.modResults.NSFaceIDUsageDescription;
    result.modResults.AptlyReleaseChannel = config.extra?.releaseChannel ?? 'pilot';
    result.modResults.AptlyRecorderMode = config.extra?.recorderMode ?? 'native';
    result.modResults.AptlyAPIOrigin =
      config.extra?.releaseChannel === 'store'
        ? process.env.EXPO_PUBLIC_API_URL
          ? new URL(process.env.EXPO_PUBLIC_API_URL).origin
          : ''
        : '';
    return result;
  });
  return withXcodeProject(config, (result) => {
    const project = result.modResults;
    const name = '[Aptly] Package supplied SDK privacy resources';
    const phases = project.hash.project.objects.PBXShellScriptBuildPhase ?? {};
    if (
      !Object.values(phases).some(
        (phase) => typeof phase === 'object' && phase.name === `"${name}"`,
      )
    ) {
      project.addBuildPhase([], 'PBXShellScriptBuildPhase', name, project.getFirstTarget().uuid, {
        shellPath: '/bin/sh',
        shellScript:
          'set -eu\nif [ -f "$PROJECT_DIR/.xcode.env" ]; then . "$PROJECT_DIR/.xcode.env"; fi\nif [ -f "$PROJECT_DIR/.xcode.env.local" ]; then . "$PROJECT_DIR/.xcode.env.local"; fi\n"${NODE_BINARY:-node}" "$PROJECT_DIR/../../../scripts/package-ios-privacy.mjs" "$PROJECT_DIR/.." "$TARGET_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH"',
      });
    }
    return result;
  });
};
