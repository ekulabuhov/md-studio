import { Component, ViewChild } from '@angular/core';
import { CanvasComponent } from '../canvas/canvas.component';
import { TreeModule } from 'primeng/tree';
import { MenuItem, TreeNode } from 'primeng/api';
import { deleteEntity, projectStructure, SpriteDefinition } from '../project';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ContextMenuModule } from 'primeng/contextmenu';
import { AssetDrawerComponent } from '../asset-drawer/asset-drawer.component';
import { Modal } from 'bootstrap';

type FileSelectTypes = 'sprite' | 'bga' | 'bgb';

@Component({
  selector: 'app-main',
  standalone: true,
  imports: [
    CanvasComponent,
    TreeModule,
    CommonModule,
    FormsModule,
    ContextMenuModule,
    AssetDrawerComponent,
  ],
  templateUrl: './main.component.html',
  styleUrl: './main.component.scss',
})
export class MainComponent {
  @ViewChild(CanvasComponent) canvasComponent: CanvasComponent;
  files: TreeNode[] = [
    {
      label: 'Scene 1',
      expanded: true,
      children: projectStructure.sprites.map((sprite, i) => ({
        label: sprite.id,
        icon: 'pi pi-user',
        data: sprite,
      })),
    },
  ];
  selectedSpriteIndex: number;
  selectedSprite?: SpriteDefinition;
  params: string[];
  selectedFile: TreeNode;
  menuItems: MenuItem[] = [
    {
      label: 'Add sprite',
      icon: 'pi pi-search',
      command: (event) => this.addSprite(),
    },
    {
      label: 'Delete sprite',
      icon: 'pi pi-times',
      command: (event) => this.deleteSprite(),
    },
    {
      label: 'Add scene',
      icon: 'pi pi-times',
      command: (event) => this.addScene(),
    },
  ];
  projectStructure = projectStructure;

  deleteSprite(): void {
    projectStructure.sprites.splice(this.selectedSpriteIndex, 1);
    this.files[0].children.splice(this.selectedSpriteIndex, 1);

    deleteEntity.next(this.selectedSpriteIndex);
  }

  addSprite(): void {
    const newSprite = { id: 'new_item' } as SpriteDefinition;
    projectStructure.sprites.push();
    this.files[0].children.push({
      label: newSprite.id,
      icon: 'pi pi-user',
    });
  }

  addScene(): void {
    throw new Error('Method not implemented.');
  }

  onEntitySelect(i: number) {
    this.selectedSpriteIndex = i;
    this.selectedFile = this.files[0].children[i];
    this.onSelectionChange(projectStructure.sprites[i]);
  }

  onParamChange() {
    const spriteIndex = projectStructure.sprites.indexOf(this.selectedSprite);
    this.canvasComponent.onReloadScriptsClick(spriteIndex);
  }

  onSelectionChange(selection: SpriteDefinition) {
    this.selectedSpriteIndex = projectStructure.sprites.indexOf(selection);
    this.selectedSprite = selection;
    this.params = this.selectedSprite.script
      .toString()
      .match(/constructor\((.*)\)/)[1]
      .split(', ')
      .slice(1);
  }

  modal: Modal;
  fileSelectType: FileSelectTypes;
  onFileSelect(type: FileSelectTypes) {
    this.fileSelectType = type;
    this.modal = new Modal('#fileSelectModal');
    this.modal.show();
  }

  async onFileSelected(fileUrl: string) {
    if (this.fileSelectType === 'sprite') {
      const sprite = projectStructure.sprites[this.selectedSpriteIndex];
      sprite.animations[0] = { name: '?', imageURL: fileUrl };
    } else if (this.fileSelectType === 'bga') {
      projectStructure.bgA.imageURL = fileUrl;
    } else if (this.fileSelectType === 'bgb') {
      projectStructure.bgB.imageURL = fileUrl;
    }

    this.canvasComponent.onFileSelected(this.fileSelectType);

    this.modal.hide();
  }
}
