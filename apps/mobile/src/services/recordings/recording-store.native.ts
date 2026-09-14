import { Directory, File, Paths } from 'expo-file-system';

import { createFileRecordingStore, type RecordingFileSystem } from './file-recording-store';

const files: RecordingFileSystem = {
  async ensureDirectory(path) {
    new Directory(path).create({ idempotent: true, intermediates: true });
  },
  async list(path) {
    return new Directory(path)
      .list()
      .map((entry) => ({ name: entry.name, isDirectory: entry instanceof Directory }));
  },
  async exists(path) {
    return Paths.info(path).exists;
  },
  async size(path) {
    return new File(path).size;
  },
  readText: (path) => new File(path).text(),
  async writeText(path, text) {
    const file = new File(path);
    file.create();
    file.write(text);
  },
  copyFile: (source, destination) => new File(source).copy(new File(destination)),
  async move(source, destination, directory) {
    // Expo moves a directory *inside* an existing destination directory. This store's
    // commit protocol always requires a new destination, never a nested move.
    if (Paths.info(destination).exists)
      throw new Error('The recording destination already exists.');
    if (directory) await new Directory(source).move(new Directory(destination));
    else await new File(source).move(new File(destination));
  },
  async remove(path, directory) {
    if (directory) new Directory(path).delete();
    else new File(path).delete();
  },
};

export const recordingStore = createFileRecordingStore({
  files,
  root: new Directory(Paths.document, 'aptly-recordings-v1').uri,
  cacheRoot: new Directory(Paths.cache, 'aptly-recording-audio-v1').uri,
});
