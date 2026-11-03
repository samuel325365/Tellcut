// Render slots for npm run batch:render: several agents making films side by side (e.g. Claude Code subagents) finish their videos at
// different times, and eight headless Chromes rendering at once on an 8-core machine make every render (and every check)
// several times slower. A slot is a folder made with mkdir (atomic); its owner file ("<pid> <label>", written to a temp
// file and renamed in, so it is never half-written) names the process holding it, so a slot left behind by a killed
// process is taken over.
// A pid can be reused by a new process after the holder died, and Windows offers no cheap way to read another process's
// start time, so the holder also touches its owner file (keepSlot) as a heartbeat: an owner not touched for OWNER_TTL_MS
// counts as gone even if some process has that pid now.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
// the file, not @tellcut/media-node: the takeover race test runs this module with Node's own type stripping, and the package as
// a whole has TypeScript it cannot strip (constructor parameter properties)
import { isAlive, nap } from '../../packages/media-node/src/proc.ts';

/** a holder must call keepSlot more often than this */
export const OWNER_TTL_MS = 10 * 60_000;
/** a slot folder with no owner file this long after it was made belongs to a process that died before writing one */
export const OWNERLESS_MS = 10_000;

// best effort: a contender may still have a file in it open (EPERM on Windows); a leftover slotN.stale-* folder is harmless
const drop = (d: string) => { try { rmSync(d, { recursive: true, force: true, maxRetries: 3, retryDelay: 10 }); } catch { /* left over */ } };
const age = (f: string) => { try { return Date.now() - statSync(f).mtimeMs; } catch { return -1; } };
const ownerPid = (slot: string) => { try { return Number(readFileSync(join(slot, 'owner'), 'utf8').split(' ')[0]) || 0; } catch { return null; } };

/** the slot's holder is gone: it died, stopped its heartbeat, or died before writing the owner file */
function isStale(slot: string, alive: (pid: number) => boolean): boolean {
  const pid = ownerPid(slot);
  if (pid === null) return age(slot) > OWNERLESS_MS;   // no folder at all: age -1, not stale
  return !pid || !alive(pid) || age(join(slot, 'owner')) > OWNER_TTL_MS;
}

/** Takes a free slot (slot0 … slot<n-1> in `dir`) for `label`; null when all are held by live processes. `platform`: whose way a
 *  stale slot is taken over (a test drives the macOS one on Windows). */
export function takeSlot(dir: string, slots: number, label: string, pid = process.pid, alive = isAlive, platform: NodeJS.Platform = process.platform): string | null {
  mkdirSync(dir, { recursive: true });
  for (let i = 0; i < slots; i++) {
    const slot = join(dir, `slot${i}`);
    for (let attempt = 0; attempt < 10; attempt++) {
      let made = false;
      try { mkdirSync(slot); made = true; } catch { /* held */ }
      if (made) {
        const tmp = join(slot, `owner.${pid}.tmp`);
        // A contender that judged the old slot stale a moment late can move this new one aside before its owner file is in; it
        // finds it ownerless and young, so not stale, and puts it back — wait for that instead of failing (the batch test's
        // occasional error line). Removing the folder then could delete a slot someone else has made in its place.
        for (let k = 0; k < 40; k++) {
          try { writeFileSync(tmp, `${pid} ${label}`); renameSync(tmp, join(slot, 'owner')); return slot; }
          catch (e) {
            if ((e as NodeJS.ErrnoException).code !== 'ENOENT') { rmSync(slot, { recursive: true, force: true }); throw e; }
            nap(5);
          }
        }
        continue;   // not put back: try the slot again from the start
      }
      if (!isStale(slot, alive)) break;
      if (platform !== 'win32') {
        // macOS / Linux: a rename there replaces an empty folder, so moving slots aside (below) can swap a contender's new
        // slot for the one put back, and both hold it. Instead one process at a time takes over, through a gate folder:
        // inside it the slot is judged again and removed only when stale, then everyone races for it with mkdir alone.
        const gate = `${slot}.takeover`;
        try { mkdirSync(gate); } catch { if (age(gate) > OWNERLESS_MS) drop(gate); nap(5 + Math.random() * 20); continue; }
        let removed = false;
        try { if (isStale(slot, alive)) { rmSync(slot, { recursive: true, force: true }); removed = true; } } catch { /* not ours to remove: held */ } finally { drop(gate); }
        if (!removed && existsSync(slot)) break;   // taken meanwhile, or not removable: held
        attempt--;   // the takeover itself is no failed try
        continue;
      }
      // Take it over: move it aside first. Of several processes doing this at once only one rename succeeds; removing
      // it in place would let a late remover delete the slot the first one just re-made.
      const aside = `${slot}.stale-${pid}`;
      drop(aside);
      // another process moved it, or (EPERM on Windows) some contender has a file in it open: back off a random moment
      try { renameSync(slot, aside); } catch { nap(5 + Math.random() * 20); continue; }
      // Between our check and the rename another process may have taken it over already: then put its slot back.
      if (!isStale(aside, alive)) { try { renameSync(aside, slot); } catch { /* slot re-made meanwhile: rare, leave it */ } break; }
      drop(aside);
    }
  }
  return null;
}

/** heartbeat for a held slot (see OWNER_TTL_MS) */
export const keepSlot = (slot: string) => { try { const now = new Date(); utimesSync(join(slot, 'owner'), now, now); } catch { /* gone */ } };

/** frees the slot unless it was taken over meanwhile (heartbeat missed, e.g. the machine slept) */
export const releaseSlot = (slot: string, pid = process.pid) => { if (ownerPid(slot) === pid) rmSync(slot, { recursive: true, force: true }); };

/** who holds the slots now, e.g. ["12345 food-deep"] */
export function holders(dir: string, slots: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < slots; i++) { try { out.push(readFileSync(join(dir, `slot${i}`, 'owner'), 'utf8').trim()); } catch { /* free */ } }
  return out;
}
