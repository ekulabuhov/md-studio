export type FileSystemEntry = {
  name: string;
  url?: string;
  kind: 'file' | 'directory';
};

export class fs {
  public static async getFileList(directory?: string) {
    const names: FileSystemEntry[] = [];
    if (directory) {
      names.push({ name: '..', kind: 'directory' });
    }
    
    return names.concat(await window.fs.getFileList(directory));
  }

  public static async readFile(filePath: string) {
    return await window.fs.readFile(filePath);
  }

  public static async writeFile(
    filePath: string,
    content: FileSystemWriteChunkType
  ) {
    return await (window as any).fs.writeFile(filePath, content);
  }

  public static async createDirectory(name: string) {
    // const opfsRoot = await navigator.storage.getDirectory();
    // await opfsRoot.getDirectoryHandle(name, {
    //   create: true,
    // });
  }

  public static async deleteFile(filePath: string) {
    return await (window as any).fs.deleteFile(filePath);
  }
}
