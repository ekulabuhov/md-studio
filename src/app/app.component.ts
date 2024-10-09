import { AfterViewInit, Component, ElementRef, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterOutlet } from '@angular/router';
import { Nostalgist } from 'nostalgist';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements AfterViewInit {
  @ViewChild('canvas', { static: true }) canvas?: ElementRef<HTMLCanvasElement>;
  title = 'md-studio';
  nostalgist?: Nostalgist;
  text?: string;

  constructor() {
    addEventListener('keyup', (event) => {
      if (event.key === 'Escape') {
        this.nostalgist?.exit();
      }
    });
  }

  ngAfterViewInit() {
    const canvas = this.canvas?.nativeElement as HTMLCanvasElement;
    console.log(this.canvas);
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    ctx.imageSmoothingEnabled = false;
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 16; col++) {
        const color = (row + 1) * (col + 1) * 2;
        console.log({ color });
        ctx.fillStyle = `rgb(${color} ${color} 128)`;
        ctx.fillRect(col * 8, row * 8, 8, 8);
      }
    }

    // ctx.fillText("Hello", 0, 48);
    // ctx.fillText("World!", 64, 64);
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, 8, 8);
    ctx.fillRect(128, 0, 112, 32);

    ctx.fillStyle = 'rgb(96, 96, 128)';
    ctx.fillRect(0, 32, 240, 96);

    ctx.fillStyle = 'rgb(20, 20, 128)';
    ctx.fillRect(64, 32, 64, 32);

    const DownloadCanvasAsImage = () => {
      let downloadLink = document.createElement('a');
      downloadLink.setAttribute('download', 'CanvasAsImage.png');
      canvas?.toBlob((blob) => {
        let url = URL.createObjectURL(blob!);
        downloadLink.setAttribute('href', url);
        downloadLink.click();
      });
    };
    // DownloadCanvasAsImage();
  }

  async showText() {
    console.log('starting compilation');
    const response = await (window as any).versions.ping(this.text);
    console.log(response); // prints out 'pong'
  }

  async play() {
    this.nostalgist = await Nostalgist.megadrive(
      'http://localhost:4401/out/rom.bin'
    );
  }
}
