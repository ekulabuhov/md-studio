import { Routes } from '@angular/router';
import { ResViewerComponent } from './res-viewer/res-viewer.component';
import { CanvasComponent } from './canvas/canvas.component';

export const routes: Routes = [
    {
        path: 'res-viewer',
        component: ResViewerComponent
    },
    {
        path: '',
        component: CanvasComponent
    }
];
