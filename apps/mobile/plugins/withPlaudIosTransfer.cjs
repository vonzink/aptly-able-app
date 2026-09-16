/* global require, module */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { withEntitlementsPlist, withInfoPlist } = require('expo/config-plugins');

module.exports = function withPlaudIosTransfer(config) {
  const enabled = config.ios?.infoPlist?.AptlyPlaudWifiTransferEnabled === true;
  // Prebuild merges existing native files. Explicitly remove this feature's keys
  // when switching to Bluetooth so a previously generated Wi-Fi build can sign.
  config = withEntitlementsPlist(config, (result) => {
    for (const key of [
      'com.apple.developer.networking.HotspotConfiguration',
      'com.apple.developer.networking.wifi-info',
    ]) {
      if (enabled) result.modResults[key] = true;
      else delete result.modResults[key];
    }
    return result;
  });
  return withInfoPlist(config, (result) => {
    result.modResults.AptlyPlaudWifiTransferEnabled = enabled;
    if (!enabled) {
      delete result.modResults.NSLocalNetworkUsageDescription;
      // Location also supports opt-in recording capture in Bluetooth-only builds.
      if (!config.ios?.infoPlist?.NSLocationAlwaysAndWhenInUseUsageDescription)
        delete result.modResults.NSLocationWhenInUseUsageDescription;
    }
    return result;
  });
};
