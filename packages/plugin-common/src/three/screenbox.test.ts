// ThreeKit.screenBox: where a 3D word lands on the frame, for ctx.reportText (check measures words an fx draws in WebGL by it).
import * as THREE from 'three';
import { makeKit } from './kit.ts';

test('screenBox: an object square on to the camera fills the frame part it covers; behind the camera it is null', () => {
  const kit = makeKit(THREE, {} as any);
  // a 2 × 2 plate at the distance where a face 2 high fills a 40° camera: it spans the full height and half the width of a 2:1 frame
  const camera = new THREE.PerspectiveCamera(40, 2, 0.1, 100);
  camera.position.set(0, 0, kit.fillDistance(2, 40));
  const plate = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 0));
  const g = new THREE.Group(); g.add(plate);
  const b = kit.screenBox(g, camera, 800, 400)!;
  expect(b.x).toBeCloseTo(200, 3); expect(b.w).toBeCloseTo(400, 3);
  expect(b.y).toBeCloseTo(0, 3); expect(b.h).toBeCloseTo(400, 3);
  expect(b.size).toBeCloseTo(b.h, 6);
  g.position.z = kit.fillDistance(2, 40) + 5;   // behind the camera
  expect(kit.screenBox(g, camera, 800, 400)).toBeNull();
  expect(kit.screenBox(new THREE.Group(), camera, 800, 400)).toBeNull();   // nothing in it
});
