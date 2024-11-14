import { FileSystemEntry } from './app/fs_electron';

declare global {
  interface Window {
    fs: {
      getFileList: (directory: string) => Promise<FileSystemEntry[]>;
      readFile: (filePath: string) => Promise<string>;
      writeFile(
        file: PathOrFileDescriptor,
        data: FileSystemWriteChunkType,
        options?: { flag?: string | undefined; }
      );
    };
    project: {
      compile: () => Promise<string>;
    };
  }
}
