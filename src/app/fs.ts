import { get, set } from 'idb-keyval';

export type FileSystemEntry = {
  name: string;
  url?: string;
  kind: 'file' | 'directory';
};

export class fs {
  public static async getFileList(directory?: string) {
    const names: FileSystemEntry[] = [];
    if (directory) {
        names.push({name: '..', kind: 'directory'});
    }

    const directoryRoot = await this.getDirectory(directory);
    for await (let [name, handle] of directoryRoot) {
      if (handle.kind === 'file') {
        if (name.startsWith('.')) {
          continue;
        }
        const url = URL.createObjectURL(
          await (handle as FileSystemFileHandle).getFile()
        );
        names.push({ name, url, kind: 'file' });
      } else if (handle.kind === 'directory') {
        names.push({ name, kind: 'directory' });
      }
    }

    return names;
  }

  public static async readFile(filePath: string) {
    const fileHandle = await fs.getFileHandle(filePath);
    const file = await fileHandle.getFile();
    return file.text();
  }

  public static async writeFile(
    filePath: string,
    content: FileSystemWriteChunkType
  ) {
    const fileHandle = await fs.getFileHandle(filePath);
    const stream = await fileHandle.createWritable();
    await stream.write(content);
    await stream.close();
  }

  static async getFileHandle(filePath: string, create = false) {
    const directory = filePath.split('/').slice(0, -1).join('/');
    const fileName = filePath.split('/').pop();
    const directoryRoot = await fs.getDirectory(directory);
    return directoryRoot.getFileHandle(fileName, { create });
  }

  private static async getDirectory(directory: string) {
    // @ts-ignore
    let opfsRoot = await get('directory') || await window.showDirectoryPicker({ mode: 'readwrite' });
    if (!await fs.verifyPermission(opfsRoot, true)) {
      throw new Error(`no permissions to read/write ${directory}`);
    }
    await set('directory', opfsRoot);
    // let opfsRoot = await navigator.storage.getDirectory();
    if (directory) {
      const dirs = directory.split('/');
      for (let i = 0; i < dirs.length; i++) {
        const dir = dirs[i];
        opfsRoot = await opfsRoot.getDirectoryHandle(dir, {
          create: true,
        });
      }
    }
    return opfsRoot as FileSystemDirectoryHandle &
      Iterable<[string, FileSystemHandle]>;
  }

  public static async createDirectory(name: string) {
    const opfsRoot = await navigator.storage.getDirectory();
    await opfsRoot.getDirectoryHandle(name, {
      create: true,
    });
  }

  public static async deleteFile(fileName: string, directory?: string) {
    const directoryRoot = await this.getDirectory(directory);
    await directoryRoot.removeEntry(fileName);
  }

  private static async verifyPermission(fileHandle, readWrite) {
    const options: {mode?: string} = {};
    if (readWrite) {
      options.mode = 'readwrite';
    }
    // Check if permission was already granted. If so, return true.
    if ((await fileHandle.queryPermission(options)) === 'granted') {
      return true;
    }
    // Request permission. If the user grants permission, return true.
    if ((await fileHandle.requestPermission(options)) === 'granted') {
      return true;
    }
    // The user didn't grant permission, so return false.
    return false;
  }
}
