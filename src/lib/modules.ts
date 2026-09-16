/**
 * ─────────────────────────────────────────────────────────────────────────
 *  MODULES
 * ─────────────────────────────────────────────────────────────────────────
 *  Steward's feature set isn't one product. A K-12 school might want room
 *  scheduling and work orders but have no use for camps; another might live
 *  in the IT help desk and never touch athletics. Each school turns modules
 *  on and off, and a new module can ship dark and be switched on per school
 *  rather than forcing itself on everyone.
 *
 *  This catalogue is the source of truth. The database stores only the
 *  overrides (schools.modules jsonb), so a key nobody has set falls back to
 *  `defaultOn` here and adding a module needs no migration.
 * ─────────────────────────────────────────────────────────────────────────
 */

export interface ModuleDef {
  key: string;
  name: string;
  blurb: string;
  /** On unless a school says otherwise. */
  defaultOn: boolean;
  /** Core modules can't be switched off — the app is meaningless without them. */
  required?: boolean;
}

export const MODULES: ModuleDef[] = [
  {
    key: 'scheduling',
    name: 'Spaces & scheduling',
    blurb: 'Rooms, resources, bookings, conflicts and approvals. The core.',
    defaultOn: true,
    required: true,
  },
  {
    key: 'people',
    name: 'People & permissions',
    blurb: 'Staff directory, roles, and who oversees what.',
    defaultOn: true,
    required: true,
  },
  {
    key: 'work',
    name: 'Work orders',
    blurb: 'Maintenance and setup requests, assignment and the shared queue.',
    defaultOn: true,
  },
  {
    key: 'it',
    name: 'IT help desk',
    blurb: 'Technology tickets on the same queue and ownership model.',
    defaultOn: true,
  },
  {
    key: 'crew',
    name: 'Teams & crew',
    blurb: 'Crew teams, positions, qualifications and event staffing.',
    defaultOn: true,
  },
  {
    key: 'assets',
    name: 'Assets',
    blurb: 'Equipment inventory, check-out and history.',
    defaultOn: true,
  },
  {
    key: 'security',
    name: 'Security & visitors',
    blurb: 'Guard shifts and the gate’s day. Visitor sign-ins stay off disk.',
    defaultOn: true,
  },
  {
    key: 'athletics',
    name: 'Athletics',
    blurb: 'Team schedules, home/away, transport and the weekly digest.',
    defaultOn: true,
  },
  {
    key: 'programs',
    name: 'Programs',
    blurb: 'Multi-session umbrellas over a run of related events.',
    defaultOn: true,
  },
  {
    key: 'invites',
    name: 'Invitations & RSVP',
    blurb: 'Invite staff or outside guests; public no-account RSVP links.',
    defaultOn: true,
  },
  {
    key: 'rentals',
    name: 'Facility rentals',
    blurb: 'Outside organisations renting space, with rates and agreements.',
    defaultOn: false,
  },
  {
    key: 'camps',
    name: 'Camps & trips',
    blurb: 'Buses, cabins, roles and duties for overnight programmes.',
    defaultOn: false,
  },
  {
    key: 'insights',
    name: 'Insights',
    blurb: 'Utilisation, turnaround and the reporting Planning Center lacked.',
    defaultOn: true,
  },
  {
    key: 'audit',
    name: 'Audit trail',
    blurb: 'Who changed what, when. Usually a compliance requirement.',
    defaultOn: true,
  },
];

export type ModuleFlags = Record<string, boolean>;

const BY_KEY = new Map(MODULES.map((m) => [m.key, m]));

/** Is a module on for this school? Unknown keys are off, not on. */
export function moduleEnabled(flags: ModuleFlags | undefined, key: string): boolean {
  const def = BY_KEY.get(key);
  if (!def) return false;
  if (def.required) return true;
  return flags?.[key] ?? def.defaultOn;
}

/** The catalogue with each module resolved for this school — for a settings UI. */
export function resolvedModules(flags: ModuleFlags | undefined) {
  return MODULES.map((m) => ({ ...m, on: moduleEnabled(flags, m.key) }));
}
