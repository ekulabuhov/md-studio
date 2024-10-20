import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AssetDrawerComponent } from './asset-drawer.component';

describe('AssetDrawerComponent', () => {
  let component: AssetDrawerComponent;
  let fixture: ComponentFixture<AssetDrawerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AssetDrawerComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AssetDrawerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
