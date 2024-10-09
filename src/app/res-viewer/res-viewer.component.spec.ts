import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ResViewerComponent } from './res-viewer.component';

describe('ResViewerComponent', () => {
  let component: ResViewerComponent;
  let fixture: ComponentFixture<ResViewerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ResViewerComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ResViewerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
