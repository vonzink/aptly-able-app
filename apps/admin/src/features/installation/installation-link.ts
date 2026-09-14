import { enrollmentTokenSchema, type EnrollmentPlatform } from '@aptly/contracts';

export function installationLink(href: string) {
  const url = new URL(href);
  const fragment = new URLSearchParams(url.hash.slice(1));
  const token = enrollmentTokenSchema.safeParse(fragment.get('token'));
  const platform = url.searchParams.get('platform');
  return {
    platform: (platform === 'ios' || platform === 'android'
      ? platform
      : null) as EnrollmentPlatform | null,
    appUrl:
      token.success && !url.searchParams.has('token') && fragment.getAll('token').length === 1
        ? `aptlyable://enroll#${new URLSearchParams({ token: token.data })}`
        : null,
  };
}

export function installationDownload(
  value: string | undefined,
  platform: EnrollmentPlatform,
): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) return null;
    if (
      platform === 'ios' &&
      (url.hostname !== 'testflight.apple.com' || !url.pathname.startsWith('/join/'))
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}
