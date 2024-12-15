import { Routes } from '@angular/router';
import { ResViewerComponent } from './res-viewer/res-viewer.component';
import { MainComponent } from './main/main.component';

export const routes: Routes = [
    {
        path: 'res-viewer',
        component: ResViewerComponent
    },
    {
        path: '',
        component: MainComponent
    }
];
