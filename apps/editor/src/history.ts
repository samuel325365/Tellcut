// Unlimited undo/redo as immer patch pairs (spec §2.2, §4.5).
import { applyPatches, enablePatches, produce, produceWithPatches, type Patch } from 'immer';
import { settle, type Project } from '@tellcut/engine';

enablePatches();
type Recipe = (draft: Project) => unknown;
/** Commands mutate the draft; what they return (a new id, an index) must not reach immer, which would take it as a replacement.
 *  After the recipe, the magnetic track's rules apply and transitions and crossfades linked to an overlap follow it
 *  (specs 2026-10-15-proposals-magnetic §4.2, 2026-10-14 §3.3): same undo step. */
const mutate = (r: Recipe, before: Project) => (d: Project) => { r(d); settle(before, d); };

export class History {
  private done: Array<{ redo: Patch[]; undo: Patch[] }> = [];
  private undone: Array<{ redo: Patch[]; undo: Patch[] }> = [];
  constructor(public project: Project, private limit = 1000) {}

  get canUndo() { return this.done.length > 0; }
  get canRedo() { return this.undone.length > 0; }

  /** One undoable step. A recipe that throws leaves everything unchanged (the error propagates). */
  apply(recipe: Recipe): Project {
    const [next, redo, undo] = produceWithPatches(this.project, mutate(recipe, this.project));
    if (!redo.length) return this.project;
    this.done.push({ redo, undo });
    if (this.done.length > this.limit) this.done.shift();
    this.undone = [];
    this.project = next;
    return next;
  }

  /** The project with the recipe applied, not recorded (live preview while dragging). */
  preview(recipe: Recipe): Project { return produce(this.project, mutate(recipe, this.project)); }

  undo(): Project | null {
    const e = this.done.pop();
    if (!e) return null;
    this.project = applyPatches(this.project, e.undo);
    this.undone.push(e);
    return this.project;
  }

  redo(): Project | null {
    const e = this.undone.pop();
    if (!e) return null;
    this.project = applyPatches(this.project, e.redo);
    this.done.push(e);
    return this.project;
  }
}
