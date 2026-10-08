import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { MarbleCustomization, generateMarbleTexture } from './texture';
import { MARBLE_RADIUS } from '../tracks/trackPiece';
import { soundEngine } from '../audio/sound';

export interface MarbleEntity {
  customization: MarbleCustomization;
  mesh: THREE.Mesh;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  finished: boolean;
  finishTime?: number;
  lastPos: THREE.Vector3;
}

export class MarbleManager {
  public scene: THREE.Scene;
  public world: RAPIER.World;
  public marbles: MarbleEntity[] = [];

  constructor(scene: THREE.Scene, world: RAPIER.World) {
    this.scene = scene;
    this.world = world;
  }

  public spawnMarbles(configs: MarbleCustomization[], spawnPoints: THREE.Vector3[]): MarbleEntity[] {
    this.clearMarbles();

    configs.forEach((config, idx) => {
      const spawnPos = spawnPoints[idx % spawnPoints.length];

      // Create Three.js Glass / Polished Marble mesh
      const texture = generateMarbleTexture(config.primaryColor, config.secondaryColor, config.pattern);
      const geometry = new THREE.SphereGeometry(MARBLE_RADIUS, 32, 32);
      const material = new THREE.MeshPhysicalMaterial({
        map: texture,
        roughness: 0.1,
        metalness: 0.1,
        clearcoat: 1.0,
        clearcoatRoughness: 0.1,
        reflectivity: 0.9,
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.copy(spawnPos);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);

      // Create Dynamic Rapier RigidBody with realistic sphere physics
      const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(spawnPos.x, spawnPos.y, spawnPos.z)
        .setCcdEnabled(true) // Continuous Collision Detection to prevent clipping at high speeds
        .setLinearDamping(0.05)
        .setAngularDamping(0.05);

      const body = this.world.createRigidBody(bodyDesc);

      const colliderDesc = RAPIER.ColliderDesc.ball(MARBLE_RADIUS)
        .setRestitution(0.6) // Bounciness
        .setFriction(0.3)    // Surface rolling friction
        .setDensity(2.5)     // Glass marble density
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);

      const collider = this.world.createCollider(colliderDesc, body);

      this.marbles.push({
        customization: config,
        mesh,
        body,
        collider,
        finished: false,
        lastPos: spawnPos.clone(),
      });
    });

    return this.marbles;
  }

  public update(delta: number) {
    this.marbles.forEach(marble => {
      // Sync Three.js mesh with Rapier rigid body position & rotation
      const translation = marble.body.translation();
      const rotation = marble.body.rotation();

      marble.mesh.position.set(translation.x, translation.y, translation.z);
      marble.mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);

      // Velocity & Sound modulation
      const linvel = marble.body.linvel();
      const speed = Math.sqrt(linvel.x * linvel.x + linvel.y * linvel.y + linvel.z * linvel.z);

      if (!marble.finished) {
        soundEngine.updateRollingSound(marble.customization.id, speed);
      } else {
        soundEngine.stopRollingSound(marble.customization.id);
      }

      // Out of bounds check (if marble falls off track)
      if (translation.y < -30) {
        // Respawn marble back near highest point
        marble.body.setTranslation({ x: 0, y: 5, z: 0 }, true);
        marble.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      }
    });
  }

  public clearMarbles() {
    this.marbles.forEach(marble => {
      soundEngine.stopRollingSound(marble.customization.id);
      this.scene.remove(marble.mesh);
      this.world.removeRigidBody(marble.body);
    });
    this.marbles = [];
  }
}
