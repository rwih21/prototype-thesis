export interface Restaurant {
  id: string;
  name: string;
  rating: number;
  priceLevel: string; // $, $$, $$$, $$$$
  priceValue: number; // 1, 2, 3, 4
  distance: string;
  distanceValue: number; // numeric miles
  status: 'Open' | 'Closed';
  address: string;
  description: string;
  imageUrl: string;
  foodType: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  sawScore?: number;
  criteriaScores?: {
    c1: number;
    c2: number;
    c3: number;
    c4: number;
  };
}

export type AppState = 'landing' | 'processing' | 'results';
