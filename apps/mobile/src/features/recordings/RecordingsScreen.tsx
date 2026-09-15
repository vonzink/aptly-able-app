import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useEnrollmentSnapshot } from '../../bootstrap/AppProviders';
import {
  Button,
  Card,
  EmptyState,
  PageHeader,
  ScreenFrame,
  styles as screenStyles,
} from '../../ui/components';
import { fontFamily, useTheme } from '../../ui/theme';
import { RecorderSyncCard } from '../plaud-device/RecorderSyncCard';
import { useRecordings, useRecordingsController } from './RecordingsProvider';
import { RecordingRow } from './components/RecordingRow';
import type { LocalRecording } from './recording-model';
import { useImportRecording } from './use-import-recording';

const recordingKey = (recording: LocalRecording) => recording.id;
function RowSeparator() {
  return <View style={styles.separator} />;
}

export default function RecordingsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const state = useRecordings();
  const controller = useRecordingsController();
  const { actorId } = useEnrollmentSnapshot();
  const [search, setSearch] = useState('');
  const openRecording = useCallback(
    (id: string) => {
      router.push({ pathname: '/recording', params: { id } });
    },
    [router],
  );
  const importing = useImportRecording(openRecording);
  useFocusEffect(
    useCallback(() => {
      void controller.reload();
    }, [controller]),
  );
  const query = search.trim().toLocaleLowerCase();
  const recordings = useMemo(
    () =>
      state.recordings.filter(
        (recording) =>
          !query ||
          `${recording.title} ${recording.originalName} ${recording.notes ?? ''} ${recording.transcript?.text ?? ''}`
            .toLocaleLowerCase()
            .includes(query),
      ),
    [state.recordings, query],
  );
  const renderRecording = useCallback(
    ({ item }: { item: LocalRecording }) => (
      <RecordingRow recording={item} onOpen={openRecording} />
    ),
    [openRecording],
  );

  return (
    <ScreenFrame>
      <FlatList
        data={recordings}
        keyExtractor={recordingKey}
        renderItem={renderRecording}
        ItemSeparatorComponent={RowSeparator}
        contentContainerStyle={styles.list}
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListHeaderComponent={
          <View style={styles.header}>
            <PageHeader title="Recordings" copy="Listen, read transcripts and manage your audio." />
            <View
              style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.line }]}
            >
              <Ionicons name="search-outline" color={colors.inkSecondary} size={19} />
              <TextInput
                accessibilityLabel="Search recordings"
                accessibilityHint="Search titles, notes and transcripts."
                placeholder="Search recordings"
                placeholderTextColor={colors.inkMuted}
                value={search}
                onChangeText={setSearch}
                style={[styles.searchInput, { color: colors.ink }]}
                autoCorrect={false}
                returnKeyType="search"
              />
              {search ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Clear recording search"
                  onPress={() => setSearch('')}
                  style={({ pressed }) => [styles.clearSearch, { opacity: pressed ? 0.6 : 1 }]}
                >
                  <Ionicons name="close-circle" color={colors.inkSecondary} size={22} />
                </Pressable>
              ) : null}
            </View>
            <RecorderSyncCard />
            <View style={styles.tools}>
              <View style={styles.importAction}>
                <Button
                  variant="secondary"
                  label="Import audio file"
                  loading={importing.picking}
                  disabled={state.busy || state.loading}
                  onPress={() => void importing.importRecording()}
                />
              </View>
              <View style={styles.storageAction}>
                <Button
                  label="Storage"
                  variant="text"
                  accessibilityLabel="Manage audio storage in Settings"
                  onPress={() => router.push('/settings')}
                />
              </View>
            </View>
            <Text style={[styles.hint, { color: colors.inkSecondary }]}>
              Import other audio: MP3, WAV or M4A · up to 250 MB
            </Text>
            {!actorId ? (
              <Card style={styles.notice}>
                <Text style={[styles.copy, { color: colors.inkSecondary }]}>
                  Sign in to see your saved Plaud recordings. Imported audio on this device is still
                  available.
                </Text>
                <Button label="Sign in" variant="text" onPress={() => router.push('/enroll')} />
              </Card>
            ) : null}
            {importing.error || state.error ? (
              <Card style={styles.notice}>
                <Text accessibilityRole="alert" style={[styles.copy, { color: colors.danger }]}>
                  {importing.error ?? state.error}
                </Text>
                <Button
                  label="Refresh library"
                  variant="text"
                  loading={state.busy}
                  onPress={() => {
                    importing.clearError();
                    void controller.reload();
                  }}
                />
              </Card>
            ) : null}
            {state.loading ? (
              <ActivityIndicator accessibilityLabel="Loading recordings" color={colors.accent} />
            ) : null}
            {state.unavailableCount > 0 ? (
              <Card style={styles.notice}>
                <Text accessibilityRole="alert" style={[styles.copy, { color: colors.danger }]}>
                  {state.unavailableCount === 1
                    ? 'One saved recording could not be read.'
                    : `${state.unavailableCount} saved recordings could not be read.`}{' '}
                  Their files have been preserved. Automatic sync is paused to prevent duplicate
                  imports.
                  {state.recordings.length > 0 ? ' Your other recordings are available below.' : ''}
                </Text>
                <Button
                  label="Try loading again"
                  variant="text"
                  loading={state.busy}
                  onPress={() => void controller.reload()}
                />
              </Card>
            ) : null}
            {state.recordings.length > 0 ? (
              <>
                <View style={styles.section}>
                  <Text
                    accessibilityRole="header"
                    style={[styles.sectionTitle, { color: colors.ink }]}
                  >
                    {query ? 'Search results' : 'Your library'}
                  </Text>
                  <Text style={[styles.hint, { color: colors.inkSecondary }]}>
                    {recordings.length} {recordings.length === 1 ? 'recording' : 'recordings'}
                  </Text>
                </View>
              </>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          query && state.recordings.length > 0 ? (
            <EmptyState
              icon={<Ionicons name="search-outline" size={30} color={colors.accent} />}
              title="No matching recordings"
              copy="Try a title, a word from your notes, or an attached transcript."
              action={
                <Button label="Clear search" variant="secondary" onPress={() => setSearch('')} />
              }
            />
          ) : !state.loading && !state.error && state.unavailableCount === 0 ? (
            <EmptyState
              icon={<Ionicons name="headset-outline" size={34} color={colors.accent} />}
              title="Your library is ready"
              copy={
                actorId
                  ? 'Finish a recording, then keep your Plaud connected and this app open. Your audio will appear here automatically.'
                  : 'You can import an audio file now, or sign in above to connect your Plaud recorder.'
              }
              action={
                actorId ? (
                  <Button
                    label="Open recorder"
                    variant="secondary"
                    onPress={() => router.push('/recorder')}
                  />
                ) : null
              }
            />
          ) : null
        }
      />
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  list: { ...screenStyles.screen, gap: 0 },
  header: { gap: 14, paddingBottom: 16 },
  tools: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  importAction: { flexGrow: 1, flexBasis: 180 },
  storageAction: { flexGrow: 1, flexBasis: 90 },
  notice: { gap: 8 },
  copy: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 22 },
  hint: { fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 19 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingLeft: 14,
    minHeight: 52,
  },
  searchInput: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 14,
    paddingVertical: 12,
    minWidth: 0,
  },
  clearSearch: { minWidth: 44, minHeight: 48, justifyContent: 'center', alignItems: 'center' },
  section: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: { fontFamily: fontFamily.semibold, fontSize: 17 },
  separator: { height: 12 },
});
