import Constants from 'expo-constants';

export const isStoreRelease = Constants.expoConfig?.extra?.releaseChannel === 'store';
