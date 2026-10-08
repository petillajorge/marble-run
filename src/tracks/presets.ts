import { TrackPieceData } from '../tracks/types';

// Preset Scenario 1: Grand Helix Speedway
export const PRESET_GRAND_HELIX: TrackPieceData[] = [
  { id: 'p1', type: 'start_gate', position: [0, 8, 0], rotation: [0, 0, 0] },
  { id: 'p2', type: 'slope_down', position: [0, 8, 3], rotation: [0, 0, 0] },
  { id: 'p3', type: 'curve_90', position: [0, 6.5, 7], rotation: [0, 0, 0] },
  { id: 'p4', type: 'straight', position: [-3, 6.5, 10], rotation: [0, Math.PI / 2, 0] },
  { id: 'p5', type: 'loop', position: [-7, 6.5, 10], rotation: [0, Math.PI, 0] },
  { id: 'p6', type: 'funnel', position: [-7, 6.5, 12], rotation: [0, 0, 0] },
  { id: 'p7', type: 'slope_down', position: [-7, 5.3, 12], rotation: [0, Math.PI / 2, 0] },
  { id: 'p8', type: 'splitter_paddle', position: [-11, 3.8, 12], rotation: [0, Math.PI / 2, 0] },
  { id: 'p9', type: 'finish_gate', position: [-14, 3.8, 10.5], rotation: [0, Math.PI, 0] }
];

// Preset Scenario 2: Double Loop Rollercoaster
export const PRESET_ROLLERCOASTER: TrackPieceData[] = [
  { id: 'r1', type: 'start_gate', position: [0, 10, 0], rotation: [0, 0, 0] },
  { id: 'r2', type: 'slope_down', position: [0, 10, 3], rotation: [0, 0, 0] },
  { id: 'r3', type: 'straight', position: [0, 8.5, 7], rotation: [0, 0, 0] },
  { id: 'r4', type: 'loop', position: [0, 8.5, 11], rotation: [0, 0, 0] },
  { id: 'r5', type: 'slope_down', position: [0, 8.5, 13], rotation: [0, 0, 0] },
  { id: 'r6', type: 'splitter_dual', position: [0, 7.0, 17], rotation: [0, 0, 0] },
  { id: 'r7', type: 'finish_gate', position: [-1.4, 7.0, 21.8], rotation: [0, 0, 0] }
];
