import { Application, Container, Graphics, Text } from 'pixi.js';
import { gsap } from 'gsap';
import type { GameState } from '@uno/shared-types';

export async function mountTableScene(target: HTMLElement, state: GameState): Promise<Application> {
  const app = new Application();
  await app.init({ resizeTo: target, backgroundAlpha: 0, antialias: true });
  target.appendChild(app.canvas);
  const table = new Container();
  app.stage.addChild(table);
  const ring = new Graphics().circle(0, 0, 180).fill({ color: 0x213a8f, alpha: 0.55 });
  table.addChild(ring);
  table.addChild(new Text({ text: `UNO ${state.players.length}P`, style: { fill: 0xffffff, fontSize: 26 } }));
  table.position.set(app.screen.width / 2, app.screen.height / 2);
  gsap.to(table.scale, { x: 1.03, y: 1.03, repeat: -1, yoyo: true, duration: 2.2, ease: 'sine.inOut' });
  return app;
}

export function seatPosition(index: number, total: number, radius: number): { x: number; y: number } {
  const angle = -Math.PI / 2 + (Math.PI * 2 * index) / Math.max(total, 1);
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}
