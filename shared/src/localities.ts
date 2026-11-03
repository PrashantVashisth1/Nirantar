/**
 * Delivery localities with approximate centre coordinates (plan assumption A4).
 *
 * We don't call any maps or geocoding API (external systems are mocked), so a
 * customer picks their locality from this list and we use its centre point to
 * measure straight-line distance to stores. Coordinates are approximate and
 * for the prototype only.
 */
export interface Locality {
  id: string;
  name: string;
  city: 'Kolkata' | 'Howrah';
  lat: number;
  lng: number;
}

export const LOCALITIES: readonly Locality[] = [
  { id: 'salt-lake-1', name: 'Salt Lake Sector I', city: 'Kolkata', lat: 22.59, lng: 88.412 },
  { id: 'salt-lake-2', name: 'Salt Lake Sector II', city: 'Kolkata', lat: 22.586, lng: 88.406 },
  { id: 'salt-lake-3', name: 'Salt Lake Sector III', city: 'Kolkata', lat: 22.573, lng: 88.414 },
  { id: 'sector-v', name: 'Sector V', city: 'Kolkata', lat: 22.575, lng: 88.432 },
  { id: 'new-town-1', name: 'New Town Action Area I', city: 'Kolkata', lat: 22.58, lng: 88.46 },
  { id: 'new-town-2', name: 'New Town Action Area II', city: 'Kolkata', lat: 22.588, lng: 88.477 },
  { id: 'lake-town', name: 'Lake Town', city: 'Kolkata', lat: 22.603, lng: 88.4 },
  { id: 'dum-dum', name: 'Dum Dum (Nagerbazar)', city: 'Kolkata', lat: 22.623, lng: 88.42 },
  { id: 'baguiati', name: 'Baguiati', city: 'Kolkata', lat: 22.612, lng: 88.43 },
  { id: 'ultadanga', name: 'Ultadanga', city: 'Kolkata', lat: 22.592, lng: 88.391 },
  { id: 'shyambazar', name: 'Shyambazar', city: 'Kolkata', lat: 22.6, lng: 88.372 },
  { id: 'bowbazar', name: 'Bowbazar', city: 'Kolkata', lat: 22.569, lng: 88.36 },
  { id: 'park-street', name: 'Park Street', city: 'Kolkata', lat: 22.553, lng: 88.352 },
  { id: 'park-circus', name: 'Park Circus', city: 'Kolkata', lat: 22.541, lng: 88.37 },
  { id: 'bhowanipore', name: 'Bhowanipore', city: 'Kolkata', lat: 22.533, lng: 88.346 },
  { id: 'alipore', name: 'Alipore', city: 'Kolkata', lat: 22.531, lng: 88.33 },
  { id: 'ballygunge', name: 'Ballygunge', city: 'Kolkata', lat: 22.527, lng: 88.365 },
  { id: 'gariahat', name: 'Gariahat', city: 'Kolkata', lat: 22.519, lng: 88.367 },
  { id: 'kasba', name: 'Kasba', city: 'Kolkata', lat: 22.515, lng: 88.39 },
  { id: 'jadavpur', name: 'Jadavpur', city: 'Kolkata', lat: 22.497, lng: 88.372 },
  { id: 'tollygunge', name: 'Tollygunge', city: 'Kolkata', lat: 22.498, lng: 88.346 },
  { id: 'behala-chowrasta', name: 'Behala Chowrasta', city: 'Kolkata', lat: 22.498, lng: 88.31 },
  { id: 'behala-sakherbazar', name: 'Behala Sakherbazar', city: 'Kolkata', lat: 22.482, lng: 88.301 },
  { id: 'garia', name: 'Garia', city: 'Kolkata', lat: 22.465, lng: 88.385 },
  { id: 'howrah-maidan', name: 'Howrah Maidan', city: 'Howrah', lat: 22.587, lng: 88.312 },
  { id: 'shibpur', name: 'Shibpur', city: 'Howrah', lat: 22.567, lng: 88.315 },
  { id: 'santragachi', name: 'Santragachi', city: 'Howrah', lat: 22.577, lng: 88.284 },
  { id: 'salkia', name: 'Salkia', city: 'Howrah', lat: 22.603, lng: 88.343 },
  { id: 'liluah', name: 'Liluah', city: 'Howrah', lat: 22.628, lng: 88.334 },
  { id: 'bally', name: 'Bally', city: 'Howrah', lat: 22.646, lng: 88.34 },
];

export function findLocality(id: string): Locality | undefined {
  return LOCALITIES.find((locality) => locality.id === id);
}
