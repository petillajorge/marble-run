import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

export type TrackPieceType =
  | 'start_gate'
  | 'finish_gate'
  | 'straight'
  | 'slope_down'
  | 'slope_up'
  | 'curve_90'
  | 'loop'
  | 'funnel'
  | 'splitter_paddle'
  | 'splitter_dual';

export interface TrackSocket {
  id: string; // e.g. 'in', 'out', 'out_left', 'out_right'
  type: 'in' | 'out';
  localPosition: THREE.Vector3;
  localDirection: THREE.Vector3; // Unit vector pointing along direction of travel out of or into socket
  connectedPieceId?: string;
  connectedSocketId?: string;
}

export interface TrackPieceData {
  id: string;
  type: TrackPieceType;
  position: [number, number, number];
  rotation: [number, number, number]; // Euler angles (x, y, z) in radians
}

export interface PlacedTrackPiece {
  data: TrackPieceData;
  group: THREE.Group;
  sockets: TrackSocket[];
  rigidBody?: RAPIER.RigidBody;
  colliders: RAPIER.Collider[];
  updateAnimation?: (delta: number) => void;
  // Specific track mechanisms
  gateTrigger?: () => void;
  resetGate?: () => void;
}
