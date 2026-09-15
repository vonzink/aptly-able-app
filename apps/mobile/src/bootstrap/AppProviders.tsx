import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { Inter_800ExtraBold } from '@expo-google-fonts/inter/800ExtraBold';
import {
  createApiClient,
  createAuthClient,
  createAccountClient,
  type AccountClient,
  createSessionController,
  type SessionController,
  createTranscriptionClient,
  createPlaudDeviceClient,
  type TranscriptionClient,
  type AuthClient,
} from '@aptly/api-client';
import * as Crypto from 'expo-crypto';
import { useFonts } from 'expo-font';
import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import { ActivityIndicator, AppState, Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createReplaySafeLifecycle } from './recorder-lifecycle';
import { createRecorderAdapter } from './recorder-mode';
import {
  createRecorderController,
  type RecorderController,
  type RecorderSnapshot,
} from '../features/recorder/recorder-controller';
import { lightColors } from '../ui/theme';
import { createAccountSessionStore } from '../services/session-store';
import { SessionRestoration } from '../features/session/SessionRestoration';
import { RecordingsProvider } from '../features/recordings/RecordingsProvider';
import { PlaudSyncProvider } from '../features/plaud-device/PlaudSyncProvider';
import { enrollmentJournal } from '../services/enrollment-journal';
import { plaudNative } from '../services/plaud-native';
import {
  createPlaudDeviceController,
  type PlaudDeviceController,
} from '../features/plaud-device/plaud-device-controller';
import {
  createEnrollmentController,
  type EnrollmentController,
  type EnrollmentSnapshot,
} from '../features/enrollment/enrollment-controller';

const TranscriptionContext = createContext<TranscriptionClient | null>(null);
const SessionContext = createContext<SessionController | null>(null);
const AuthContext = createContext<AuthClient | null>(null);
const AccountDeletionContext = createContext<
  ((recoveryCredential?: string) => AccountClient) | null
>(null);
const PlaudDeviceContext = createContext<PlaudDeviceController | null>(null);
const RecorderContext = createContext<RecorderController | null>(null);
const EnrollmentContext = createContext<EnrollmentController | null>(null);

export function AppProviders({ children }: { children: ReactNode }) {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });
  const clients = useMemo(() => {
    const service = {
      baseUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4100',
      ...(__DEV__ && process.env.EXPO_PUBLIC_DEV_HTTP_ORIGIN
        ? { developmentHttpOrigin: process.env.EXPO_PUBLIC_DEV_HTTP_ORIGIN }
        : {}),
    };
    const auth = createAuthClient(service);
    const session = createSessionController({
      store: createAccountSessionStore(
        service.baseUrl,
        process.env.EXPO_PUBLIC_AUTH_MODE ?? 'development',
      ),
      verify: (credential, options) =>
        createApiClient({ ...service, getCredential: () => credential }).session(options),
      revoke: (credential) => auth.logout(credential),
    });
    const authenticated = {
      ...service,
      getCredential: session.getCredential,
      fetch: session.guardFetch(),
    };
    const client = createApiClient(authenticated);
    return {
      client,
      auth,
      session,
      createDeletionClient: (recoveryCredential?: string) => {
        // Retain this request's credential only in memory so an accepted deletion can
        // retrieve its receipt after normal sessions are revoked. Wrong-password 401s
        // must not trigger the global expired-session handler.
        const credential = recoveryCredential ?? session.getCredential();
        return createAccountClient({ ...service, getCredential: () => credential });
      },
      transcription: createTranscriptionClient({
        ...authenticated,
      }),
      plaudDevice: createPlaudDeviceClient({
        ...authenticated,
      }),
    };
  }, []);
  const enrollmentController = useMemo(
    () =>
      createEnrollmentController({
        client: clients.client,
        authentication: clients.session,
        journal: enrollmentJournal,
        createIdempotencyKey: Crypto.randomUUID,
      }),
    [clients],
  );
  // This controller belongs only to the explicitly selected simulation screen.
  const controller = useMemo(() => createRecorderController(createRecorderAdapter('mock')), []);
  const lifecycle = useMemo(() => createReplaySafeLifecycle(controller), [controller]);
  // One SDK session is shared across tabs. Screen subscriptions never own its teardown.
  const plaudController = useMemo(
    () =>
      createPlaudDeviceController({
        client: clients.plaudDevice,
        native: plaudNative,
        requireScanDisclosure: Platform.OS === 'android',
        onUnpaired: enrollmentController.clearAfterUnpair,
      }),
    [clients, enrollmentController],
  );
  const plaudLifecycle = useMemo(
    () => createReplaySafeLifecycle(plaudController),
    [plaudController],
  );

  const sessionLifecycle = useMemo(() => createReplaySafeLifecycle(clients.session), [clients]);
  useEffect(() => sessionLifecycle.setup(), [sessionLifecycle]);
  useEffect(() => lifecycle.setup(), [lifecycle]);
  useEffect(() => {
    const update = () => {
      const enrollment = enrollmentController.getSnapshot();
      plaudController.setEnrollment(
        enrollment.actorId
          ? {
              actorId: enrollment.actorId,
              operationId: enrollment.operation?.id ?? null,
              status: enrollment.operation?.status ?? null,
            }
          : null,
      );
    };
    // Sign-out invalidates Bluetooth callbacks synchronously on every screen.
    const unsubscribe = enrollmentController.subscribe(update);
    update();
    const teardown = plaudLifecycle.setup();
    return () => {
      unsubscribe();
      teardown();
    };
  }, [plaudController, enrollmentController, plaudLifecycle]);
  useEffect(() => {
    const onSession = () => {
      const state = clients.session.getSnapshot();
      if (state.phase === 'signed-out' && enrollmentController.getSnapshot().actorId)
        enrollmentController.clearSession(state.message);
    };
    const unsubscribe = clients.session.subscribe(onSession);
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') clients.session.checkExpiry();
    });
    void enrollmentController.restoreSession();
    return () => {
      unsubscribe();
      foreground.remove();
    };
  }, [clients, enrollmentController]);
  const sessionState = useSyncExternalStore(
    clients.session.subscribe,
    clients.session.getSnapshot,
    clients.session.getSnapshot,
  );

  if (!fontsLoaded && !fontError)
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: lightColors.bg,
        }}
      >
        <ActivityIndicator color={lightColors.accent} />
      </View>
    );

  return (
    <SafeAreaProvider>
      <SessionContext.Provider value={clients.session}>
        <AuthContext.Provider value={clients.auth}>
          <AccountDeletionContext.Provider value={clients.createDeletionClient}>
            <EnrollmentContext.Provider value={enrollmentController}>
              <RecorderContext.Provider value={controller}>
                <TranscriptionContext.Provider value={clients.transcription}>
                  <PlaudDeviceContext.Provider value={plaudController}>
                    <RecordingsProvider enrollment={enrollmentController}>
                      <PlaudSyncProvider device={plaudController} enrollment={enrollmentController}>
                        <SessionRestoration
                          state={sessionState}
                          onRetry={() => void enrollmentController.restoreSession()}
                          onSignOut={() => void enrollmentController.signOut()}
                        >
                          {children}
                        </SessionRestoration>
                      </PlaudSyncProvider>
                    </RecordingsProvider>
                  </PlaudDeviceContext.Provider>
                </TranscriptionContext.Provider>
              </RecorderContext.Provider>
            </EnrollmentContext.Provider>
          </AccountDeletionContext.Provider>
        </AuthContext.Provider>
      </SessionContext.Provider>
    </SafeAreaProvider>
  );
}

export function useAuthClient(): AuthClient {
  const client = useContext(AuthContext);
  if (!client) throw new Error('Authentication provider is missing.');
  return client;
}

export function useCreateAccountDeletionClient() {
  const createClient = useContext(AccountDeletionContext);
  if (!createClient) throw new Error('Account deletion provider is missing.');
  return createClient;
}

export function useEnrollmentController(): EnrollmentController {
  const controller = useContext(EnrollmentContext);
  if (!controller) throw new Error('Enrollment provider is missing.');
  return controller;
}

export function useEnrollmentSnapshot(): EnrollmentSnapshot {
  const controller = useEnrollmentController();
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
}

export function useRecorderController(): RecorderController {
  const controller = useContext(RecorderContext);
  if (!controller) throw new Error('Recorder provider is missing.');
  return controller;
}

export function useRecorderSnapshot(): RecorderSnapshot {
  const controller = useRecorderController();
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
}

export function useTranscriptionClient(): TranscriptionClient {
  const client = useContext(TranscriptionContext);
  if (!client) throw new Error('Transcription provider is missing.');
  return client;
}

export function usePlaudDeviceController(): PlaudDeviceController {
  const controller = useContext(PlaudDeviceContext);
  if (!controller) throw new Error('Plaud device provider is missing.');
  return controller;
}

export function useAccountSession() {
  const controller = useContext(SessionContext);
  if (!controller) throw new Error('Session provider is missing.');
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  return { controller, state };
}
