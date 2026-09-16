import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { buildSeed } from './seed';
import { setAuditActor } from './store';
import {
  authConfigured,
  currentUser,
  signInWithMicrosoft,
  signOutFromMicrosoft,
} from './auth';
import type { PersonRec } from './types';

// Sign-in is Microsoft Entra ID SSO via Supabase (see lib/auth). The "view as"
// switcher below is a separate thing: it re-renders the app through another
// staff member's permissions for testing, and never grants access — you have
// to be signed in as a WCS account before you can reach it at all.
interface SessionCtx {
  user: PersonRec;
  setUser: (p: PersonRec) => void;
  /** True once a WCS account has signed in through Microsoft. */
  authed: boolean;
  /** Opens the Microsoft sign-in popup. Rejects with a readable message. */
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  /** In flight, so the splash can show a spinner instead of a dead button. */
  signingIn: boolean;
  /** Set when sign-in failed, for display on the splash. */
  authError: string | null;
  /** False until Supabase + the Entra app registration are wired up. */
  configured: boolean;
}

const Ctx = createContext<SessionCtx | null>(null);

const seedPeople = buildSeed().people;
const defaultUser = seedPeople.find((p) => p.name === 'Rudy Garrido') ?? seedPeople[0];

/**
 * Turn the signed-in Microsoft account into the staff record the app runs on.
 * Matching is by school email. Someone real but not in the roster (a new hire,
 * or anyone the seed predates) still gets in, at the lowest permissions —
 * least privilege beats locking a legitimate employee out.
 */
function personFor(ms: { name: string; email: string }): PersonRec {
  const match = seedPeople.find((p) => p.email?.toLowerCase() === ms.email);
  if (match) return match;
  return {
    id: `ms-${ms.email}`,
    name: ms.name,
    email: ms.email,
    event: 'Viewer',
    rooms: 'Viewer',
    resources: 'Viewer',
    people: 'Viewer',
    resolves_conflicts: false,
    site_admin: false,
    active: true,
  };
}

// Keep the audit trail's actor in lock-step with the "view as" user, so store
// mutations attribute changes to whoever's currently signed in.
setAuditActor(defaultUser.name);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PersonRec>(defaultUser);
  const [authed, setAuthed] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const adopt = (ms: { name: string; email: string }) => {
    const p = personFor(ms);
    setAuditActor(p.name);
    setUser(p);
    setAuthed(true);
  };

  // Restore an existing Microsoft session so a refresh doesn't re-prompt.
  useEffect(() => {
    let cancelled = false;
    void currentUser().then((ms) => {
      if (ms && !cancelled) adopt(ms);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const switchUser = (p: PersonRec) => {
    setAuditActor(p.name);
    setUser(p);
  };

  const signIn = async () => {
    setAuthError(null);
    setSigningIn(true);
    try {
      // Either we already had a valid session, or the tab is now navigating
      // to Microsoft and this page is on its way out.
      const ms = await signInWithMicrosoft();
      if (ms) adopt(ms);
    } catch (e) {
      // Always log the whole thing — a generic on-screen message with the real
      // cause swallowed makes a sign-in failure impossible to diagnose.
      console.error('[steward] sign-in failed', e);
      const msg = e instanceof Error ? e.message : String(e);
      const code =
        typeof e === 'object' && e && 'errorCode' in e
          ? String((e as { errorCode?: unknown }).errorCode ?? '')
          : '';
      if (/user_cancelled|user_canceled/i.test(msg)) {
        // Closing the popup is a choice, not an error worth shouting about.
        setAuthError(null);
      } else {
        // Show the identifying code: AADSTS50011 and friends say precisely
        // what's misconfigured, and "please try again" alone never will.
        setAuthError(
          `Could not sign in with your WCS account${code ? ` (${code})` : ''}. ` +
            'Please try again — details are in the browser console.',
        );
      }
    } finally {
      setSigningIn(false);
    }
  };

  const signOut = async () => {
    await signOutFromMicrosoft();
    setAuthed(false);
    setUser(defaultUser);
  };

  return (
    <Ctx.Provider
      value={{
        user,
        setUser: switchUser,
        authed,
        signIn,
        signOut,
        signingIn,
        authError,
        configured: authConfigured,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useSession(): SessionCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSession outside provider');
  return c;
}

export function initials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function roleLabel(p: { site_admin: boolean; rooms: string; resources: string; event: string; department?: string; deptRole?: string }): string {
  // A department role is the most relevant hat when they have one.
  if (p.department) return `${p.department} · ${p.deptRole ?? 'Team'}`;
  if (p.site_admin) return 'Administrator';
  if (p.rooms === 'Editor' || p.resources === 'Editor') return 'Editor';
  if (p.event?.includes('Creator')) return 'Event creator';
  return 'Viewer';
}
