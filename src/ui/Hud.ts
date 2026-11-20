/**
 * A quiet HUD: the name of the place you walk into, a time-of-day line, a one-time controls hint, and the photo
 * mode badge. Hidden in photo mode, with ?hud=0, or through the harness.
 */
import { SPOTS } from '../world/layout';
import type { Input, TouchControl } from '../player/Input';

const PLACES: { name: string; label: string; r: number }[] = [
  { name: 'beach', label: 'Sunrise Beach', r: 120 },
  { name: 'jungle', label: 'The Jungle', r: 160 },
  { name: 'waterfall', label: 'The Falls', r: 60 },
  { name: 'village', label: 'Fishing Village', r: 110 },
  { name: 'cliffs', label: 'North Cliffs', r: 140 },
  { name: 'lighthouse', label: 'The Lighthouse', r: 45 },
];

export class Hud {
  private root: HTMLDivElement;
  private place: HTMLDivElement;
  private clock: HTMLDivElement;
  private hint: HTMLDivElement;
  private badge: HTMLDivElement;
  private touchControls: HTMLDivElement;
  private input: Input;
  private touchOwners = new Map<number, { control: TouchControl; element: HTMLElement; originX: number; originY: number }>();
  private movePointer: number | null = null;
  private current = '';
  private shown = true;
  private placeT = 0;

  constructor(visible: boolean, input: Input) {
    this.input = input;
    const css = document.createElement('style');
    css.textContent = `
      #hud { position: fixed; inset: 0; pointer-events: none; z-index: 20; font: 500 13px/1.4 ui-sans-serif, system-ui, "Segoe UI", sans-serif; color: #f4efe3; text-shadow: 0 1px 6px rgba(0,0,0,0.45); }
      #hud .place { position: absolute; left: 50%; top: 12%; transform: translateX(-50%); font: 400 30px/1 "Island Title", ui-serif, Georgia, serif; letter-spacing: 0.3em; opacity: 0; transition: opacity 1.2s ease; text-transform: uppercase; }
      #hud .clock { position: absolute; right: 26px; bottom: 22px; font-size: 12px; letter-spacing: 0.08em; opacity: 0.75; }
      #hud .hint { position: absolute; left: 26px; bottom: 22px; font-size: 12px; opacity: 0.8; transition: opacity 1.5s ease; max-width: 60ch; }
      #hud .badge { position: absolute; left: 50%; top: 22px; transform: translateX(-50%); font-size: 11px; letter-spacing: 0.25em; opacity: 0; transition: opacity 0.4s; }
      #hud .touch-controls { position: absolute; inset: 0; display: none; pointer-events: none; touch-action: none; user-select: none; -webkit-user-select: none; }
      #hud .touch-look { position: absolute; left: 50%; top: 0; width: 50%; height: 100%; pointer-events: auto; touch-action: none; }
      #hud .touch-look-label { position: absolute; right: max(20px, env(safe-area-inset-right, 0px)); top: 50%; transform: translateY(-50%); font-size: 10px; letter-spacing: 0.22em; opacity: 0.18; pointer-events: none; }
      #hud .touch-move { position: absolute; left: 0; top: 0; width: 50%; height: 100%; pointer-events: auto; touch-action: none; }
      #hud .touch-button { position: absolute; right: max(20px, env(safe-area-inset-right, 0px)); width: clamp(46px, 10.7vmin, 56px); height: clamp(46px, 10.7vmin, 56px); padding: 0; border: 1px solid rgba(244,239,227,0.32); border-radius: 50%; color: #f4efe3; background: rgba(8,18,22,0.25); box-shadow: 0 2px 10px rgba(0,0,0,0.16); font: 600 10px/1 ui-sans-serif, system-ui, sans-serif; letter-spacing: 0.12em; text-shadow: 0 1px 4px rgba(0,0,0,0.5); pointer-events: auto; touch-action: none; z-index: 2; }
      #hud .touch-sprint { bottom: calc(max(18px, env(safe-area-inset-bottom, 0px)) + clamp(54px, 13vmin, 68px)); }
      #hud .touch-jump { bottom: max(18px, env(safe-area-inset-bottom, 0px)); }
      #hud .touch-button.is-active { background: rgba(244,239,227,0.32); border-color: rgba(244,239,227,0.8); transform: scale(0.96); }
      @media (pointer: coarse), (hover: none) { #hud .touch-controls { display: block; } }
    `;
    document.head.appendChild(css);
    this.root = document.createElement('div');
    this.root.id = 'hud';
    this.place = document.createElement('div');
    this.place.className = 'place';
    this.clock = document.createElement('div');
    this.clock.className = 'clock';
    this.hint = document.createElement('div');
    this.hint.className = 'hint';
    this.hint.textContent = 'Click to look around · WASD move · Shift sprint · Ctrl walk · Space jump · P photo mode · M mute';
    this.badge = document.createElement('div');
    this.badge.className = 'badge';
    this.badge.textContent = 'PHOTO MODE · WASD/QE fly · Shift fast · [ ] lens · P exit';
    this.touchControls = document.createElement('div');
    this.touchControls.className = 'touch-controls';
    const look = document.createElement('div');
    look.className = 'touch-look';
    look.setAttribute('aria-label', 'Drag to rotate the camera');
    const lookLabel = document.createElement('div');
    lookLabel.className = 'touch-look-label';
    lookLabel.textContent = 'DRAG TO LOOK';
    look.append(lookLabel);
    const move = document.createElement('div');
    move.className = 'touch-move';
    move.setAttribute('role', 'application');
    move.setAttribute('aria-label', 'Drag to move');
    const sprint = document.createElement('button');
    sprint.type = 'button';
    sprint.className = 'touch-button touch-sprint';
    sprint.textContent = 'SPRINT';
    sprint.setAttribute('aria-label', 'Hold to sprint');
    const jump = document.createElement('button');
    jump.type = 'button';
    jump.className = 'touch-button touch-jump';
    jump.textContent = 'JUMP';
    jump.setAttribute('aria-label', 'Jump');
    this.touchControls.append(move, look, sprint, jump);
    this.bindTouchControl(look, 'look');
    this.bindTouchControl(move, 'move');
    this.bindTouchControl(sprint, 'sprint');
    this.bindTouchControl(jump, 'jump');
    window.addEventListener('blur', () => this.releaseAllTouchControls());
    this.root.append(this.place, this.clock, this.hint, this.badge, this.touchControls);
    document.body.appendChild(this.root);
    this.show(visible);
    setTimeout(() => (this.hint.style.opacity = '0'), 14000);
  }

  private bindTouchControl(element: HTMLElement, control: TouchControl) {
    const moveTouch = (event: PointerEvent, owner: { originX: number; originY: number }) => {
      if (control !== 'move') {
        this.input.touchMove(event.pointerId, event.clientX, event.clientY);
        return;
      }
      const radius = Math.max(44, Math.min(64, Math.min(window.innerWidth, window.innerHeight) * 0.12));
      let x = (event.clientX - owner.originX) / radius;
      let y = (owner.originY - event.clientY) / radius;
      const length = Math.hypot(x, y);
      if (length > 1) {
        x /= length;
        y /= length;
      }
      this.input.touchMove(event.pointerId, event.clientX, event.clientY, x, y);
    };
    const end = (event: PointerEvent) => {
      const owner = this.touchOwners.get(event.pointerId);
      if (!owner || owner.element !== element) return;
      this.touchOwners.delete(event.pointerId);
      this.input.touchEnd(event.pointerId);
      if (element.hasPointerCapture(event.pointerId)) {
        try { element.releasePointerCapture(event.pointerId); } catch { /* capture may already be releasing */ }
      }
      if (control === 'move' && this.movePointer === event.pointerId) {
        this.movePointer = null;
      }
      if ((control === 'sprint' || control === 'jump') && ![...this.touchOwners.values()].some((p) => p.element === element)) {
        element.classList.remove('is-active');
      }
    };
    element.addEventListener('pointerdown', (event) => {
      if (this.touchOwners.has(event.pointerId)) return;
      if (control === 'move' && this.movePointer !== null) return;
      event.preventDefault();
      try { element.setPointerCapture(event.pointerId); } catch { /* pointer may already be canceled */ }
      const owner = { control, element, originX: event.clientX, originY: event.clientY };
      this.touchOwners.set(event.pointerId, owner);
      this.input.touchStart(event.pointerId, control, event.clientX, event.clientY);
      if (control === 'move') {
        this.movePointer = event.pointerId;
        moveTouch(event, owner);
      } else {
        element.classList.add('is-active');
      }
    });
    element.addEventListener('pointermove', (event) => {
      if (this.touchOwners.get(event.pointerId)?.element !== element) return;
      event.preventDefault();
      const owner = this.touchOwners.get(event.pointerId)!;
      moveTouch(event, owner);
    });
    element.addEventListener('pointerup', end);
    element.addEventListener('pointercancel', end);
    element.addEventListener('lostpointercapture', end);
  }

  private releaseAllTouchControls() {
    for (const [pointerId, owner] of this.touchOwners) {
      this.input.touchEnd(pointerId);
      if (owner.element.hasPointerCapture(pointerId)) {
        try { owner.element.releasePointerCapture(pointerId); } catch { /* capture may already be releasing */ }
      }
    }
    this.touchOwners.clear();
    this.movePointer = null;
    this.touchControls.querySelectorAll('.is-active').forEach((element) => element.classList.remove('is-active'));
  }

  show(v: boolean) {
    if (!v) this.releaseAllTouchControls();
    this.shown = v;
    this.root.style.display = v ? 'block' : 'none';
  }

  photo(on: boolean) {
    this.badge.style.opacity = on ? '0.85' : '0';
    this.place.style.display = this.clock.style.display = this.hint.style.display = on ? 'none' : 'block';
  }

  update(dt: number, x: number, z: number, hour: number, weather: string) {
    if (!this.shown) return;
    let best = '';
    let bd = 1e9;
    for (const p of PLACES) {
      const s = SPOTS.find((q) => q.name === p.name)!;
      const d = Math.hypot(x - s.player[0], z - s.player[1]);
      if (d < p.r && d < bd) {
        bd = d;
        best = p.label;
      }
    }
    if (best && best !== this.current) {
      this.current = best;
      this.place.textContent = best;
      this.place.style.opacity = '1';
      this.placeT = 4;
    } else if (!best) this.current = '';
    if (this.placeT > 0) {
      this.placeT -= dt;
      if (this.placeT <= 0) this.place.style.opacity = '0';
    }
    const h = Math.floor(hour), m = Math.floor((hour - h) * 60);
    this.clock.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} · ${weather}`;
  }
}
