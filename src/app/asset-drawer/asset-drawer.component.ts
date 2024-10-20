import { Component, EventEmitter, Output } from '@angular/core';
// import { FileSystemEntry, fs } from '../fs';
import { FileSystemEntry, fs } from '../fs_electron';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-asset-drawer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './asset-drawer.component.html',
  styleUrl: './asset-drawer.component.scss',
})
export class AssetDrawerComponent {
  @Output() fileSelected = new EventEmitter<string>();
  output = '';
  fileList: FileSystemEntry[];
  currentDirectory = '';
  currentDirectories = [];
  showRequestPermissionBtn = false;

  constructor() {}

  async ngOnInit() {
    this.currentDirectory = localStorage.getItem('currentDirectory') || "";
    this.currentDirectories = this.currentDirectory.split('/');
    this.refreshFileList();
  }

  async refreshFileList() {
    try {
      this.fileList = await fs.getFileList(this.currentDirectory);
    } catch (error) {
      this.showRequestPermissionBtn = true;
    }
  }

  async doDrop(event: DragEvent) {
    event.stopPropagation();
    event.preventDefault();
    var dt = event.dataTransfer;
    var files = dt.files;

    // @ts-ignore
    const fileHandlesPromises = [...dt.items].map((item) =>
      item.getAsFileSystemHandle()
    ) as unknown as Promise<FileSystemHandle>[];

    for await (const handle of fileHandlesPromises) {
      // This is where we can actually exclusively act on the directories.
      if (handle.kind === 'directory') {
        console.log(`Directory: ${handle.name}`);
        await fs.createDirectory(handle.name);

        for await (const [name, fh] of (handle as FileSystemDirectoryHandle)
          // @ts-ignore
          .entries()) {
          const file = await (fh as FileSystemFileHandle).getFile();
          console.log(`File: ${name}`, fh);
          await fs.writeFile(
            handle.name + '/' + name,
            await file.arrayBuffer()
          );
        }
      }
    }

    // for (var i = 0; i < files.length; i++) {
    //   console.log(files[i].name, await files[i].arrayBuffer())
    //   // await fs.writeFile(files[i].name, await files[i].arrayBuffer());
    // }

    this.refreshFileList();
  }

  onFileRemoveClick(fileName: string) {
    fs.deleteFile(this.currentDirectory + '/' + fileName);
    this.refreshFileList();
  }

  onDirectoryClick(name: string) {
    if (name === '..') {
      this.currentDirectories.pop();
    } else {
      this.currentDirectories.push(name);
    }

    this.currentDirectory = this.currentDirectories.join('/');
    localStorage.setItem('currentDirectory', this.currentDirectory);
    this.refreshFileList();
  }

  onRequestPermissionsClick() {
    this.refreshFileList();
    this.showRequestPermissionBtn = false;
  }
}
