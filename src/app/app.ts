import { Component } from '@angular/core';
import { StarFieldComponent } from './components/star-field/star-field.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [StarFieldComponent],
  template: `<app-star-field />`,
  styles: [`
    :host {
      display: block;
      width: 100vw;
      height: 100vh;
      overflow: hidden;
    }
  `]
})
export class App {}
