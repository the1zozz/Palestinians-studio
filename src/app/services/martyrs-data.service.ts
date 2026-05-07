import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export interface Martyr {
  n: string;  // name (English)
  a: string;  // name (Arabic)
  g: string;  // age
  b: string;  // birth date
  s: 'm' | 'f'; // sex
}

@Injectable({ providedIn: 'root' })
export class MartyrsDataService {
  readonly martyrs = signal<Martyr[]>([]);
  readonly loading = signal(true);
  readonly loadProgress = signal(0);

  constructor(private http: HttpClient) {}

  load(): void {
    this.http.get<Martyr[]>('data.json').subscribe({
      next: (data) => {
        this.martyrs.set(data);
        this.loading.set(false);
        this.loadProgress.set(100);
      },
      error: (err) => {
        console.error('Failed to load martyrs data', err);
        this.loading.set(false);
      }
    });
  }
}
