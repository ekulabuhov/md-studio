import { FileSystemEntry } from './app/fs_electron';

declare global {
  interface Window {
    fs: {
      getFileList: (directory: string) => Promise<FileSystemEntry[]>;
      readFile: (filePath: string) => Promise<string>;
    };
  }
}
