import * as Linking from 'expo-linking';

export function getInitialEnrollmentLink(): Promise<string | null> {
  return Linking.getInitialURL();
}

export function subscribeToEnrollmentLinks(listener: (url: string) => void): () => void {
  const subscription = Linking.addEventListener('url', ({ url }) => listener(url));
  return () => subscription.remove();
}
