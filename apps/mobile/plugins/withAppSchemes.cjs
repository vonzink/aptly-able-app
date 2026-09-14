/* global require, module */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withAppSchemes(config) {
  const preview = config.android?.package === 'com.aptlyable.mobile.preview';
  const stale = new Set(
    preview
      ? ['aptlyable', 'com.aptlyable.mobile']
      : ['aptlyable-preview', 'com.aptlyable.mobile.preview'],
  );
  return withAndroidManifest(config, (result) => {
    // Expo prebuild appends schemes when reusing the Android project. Remove only
    // the other Aptly variant's routes so installing preview cannot claim pilot QR links.
    for (const application of result.modResults.manifest.application ?? []) {
      for (const activity of application.activity ?? []) {
        if (!activity['intent-filter']) continue;
        activity['intent-filter'] = activity['intent-filter'].filter((filter) => {
          const data = filter.data ?? [];
          if (!data.some((entry) => stale.has(entry.$?.['android:scheme']))) return true;
          const retained = data.filter((entry) => !stale.has(entry.$?.['android:scheme']));
          // Never leave a broad VIEW filter after removing its only URI scheme.
          if (!retained.some((entry) => entry.$?.['android:scheme'])) return false;
          filter.data = retained;
          return true;
        });
      }
    }
    return result;
  });
};
