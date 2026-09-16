import type { ReactNode } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { StoreProvider } from './lib/store';
import { SessionProvider, useSession } from './lib/session';
import Shell from './components/Shell';
import Login from './pages/Login';
import Home from './pages/Home';
import Calendar from './pages/Calendar';
import Spaces from './pages/Spaces';
import Requests from './pages/Requests';
import Book from './pages/Book';
import RoomDetail from './pages/RoomDetail';
import EventDetail from './pages/EventDetail';
import RunSheet from './pages/RunSheet';
import People from './pages/People';
import PersonDetail from './pages/PersonDetail';
import AthleticsWeek from './pages/AthleticsWeek';
import Queue from './pages/Queue';
import WorkDetail from './pages/WorkDetail';
import Team from './pages/Team';
import MyRequests from './pages/MyRequests';
import Insights from './pages/Insights';
import Approvals from './pages/Approvals';
import Assets from './pages/Assets';
import AssetDetail from './pages/AssetDetail';
import Rentals from './pages/Rentals';
import RentalDetail from './pages/RentalDetail';
import Audit from './pages/Audit';
import Search from './pages/Search';
import Teams from './pages/Teams';
import CrewTeamDetail from './pages/CrewTeamDetail';
import MySchedule from './pages/MySchedule';
import Programs from './pages/Programs';
import ProgramDetail from './pages/ProgramDetail';
import Security from './pages/Security';
import MyInvites from './pages/MyInvites';
import Rsvp from './pages/Rsvp';
import './App.css';

/**
 * Wraps a route that belongs to a switchable module. A school that has turned
 * the module off shouldn't reach it by typing the URL either, so the gate
 * lives here rather than only hiding links.
 */
function ModuleRoute({ module, children }: { module: string; children: ReactNode }) {
  const { hasModule } = useSession();
  if (hasModule(module)) return <>{children}</>;
  return (
    <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--text-3)' }}>
      <i className="ti ti-puzzle-off" style={{ fontSize: 28, display: 'block', marginBottom: 10 }} />
      <div style={{ fontSize: 16, marginBottom: 6 }}>This module isn&rsquo;t switched on</div>
      <div style={{ fontSize: 13 }}>An administrator can enable it in the school&rsquo;s settings.</div>
    </div>
  );
}

function Gate() {
  const { authed } = useSession();
  // Public RSVP link — the emailed invite for guests without an account. Lives
  // outside the auth gate; an external guest lands here straight from email.
  if (typeof window !== 'undefined' && window.location.hash.startsWith('#/rsvp/')) {
    // No StoreProvider: this page reads the public RSVP endpoint, not the
    // database, precisely because a guest has no account to get past RLS.
    return (
      <HashRouter>
        <Routes>
          <Route path="/rsvp/:id" element={<Rsvp />} />
          <Route path="*" element={<Rsvp />} />
        </Routes>
      </HashRouter>
    );
  }
  if (!authed) return <Login />;
  return (
    <StoreProvider>
    <HashRouter>
      <Shell>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/spaces" element={<Spaces />} />
          <Route path="/people" element={<People />} />
          <Route path="/person/:id" element={<PersonDetail />} />
          <Route path="/athletics" element={<ModuleRoute module="athletics"><AthleticsWeek /></ModuleRoute>} />
          <Route path="/requests" element={<Requests />} />
          <Route path="/queue" element={<ModuleRoute module="work"><Queue /></ModuleRoute>} />
          <Route path="/team" element={<ModuleRoute module="crew"><Team /></ModuleRoute>} />
          <Route path="/my" element={<MyRequests />} />
          <Route path="/insights" element={<ModuleRoute module="insights"><Insights /></ModuleRoute>} />
          <Route path="/approvals" element={<Approvals />} />
          <Route path="/assets" element={<ModuleRoute module="assets"><Assets /></ModuleRoute>} />
          <Route path="/asset/:id" element={<ModuleRoute module="assets"><AssetDetail /></ModuleRoute>} />
          <Route path="/rentals" element={<ModuleRoute module="rentals"><Rentals /></ModuleRoute>} />
          <Route path="/rental/:id" element={<ModuleRoute module="rentals"><RentalDetail /></ModuleRoute>} />
          <Route path="/audit" element={<ModuleRoute module="audit"><Audit /></ModuleRoute>} />
          <Route path="/search" element={<Search />} />
          <Route path="/teams" element={<ModuleRoute module="crew"><Teams /></ModuleRoute>} />
          <Route path="/crew/:teamId" element={<ModuleRoute module="crew"><CrewTeamDetail /></ModuleRoute>} />
          <Route path="/my-schedule" element={<MySchedule />} />
          <Route path="/programs" element={<ModuleRoute module="programs"><Programs /></ModuleRoute>} />
          <Route path="/program/:id" element={<ModuleRoute module="programs"><ProgramDetail /></ModuleRoute>} />
          <Route path="/security" element={<ModuleRoute module="security"><Security /></ModuleRoute>} />
          <Route path="/invites" element={<ModuleRoute module="invites"><MyInvites /></ModuleRoute>} />
          <Route path="/work/:id" element={<ModuleRoute module="work"><WorkDetail /></ModuleRoute>} />
          <Route path="/book" element={<Book />} />
          <Route path="/room/:id" element={<RoomDetail />} />
          <Route path="/event/:id" element={<EventDetail />} />
          <Route path="/runsheet/:id" element={<RunSheet />} />
        </Routes>
      </Shell>
    </HashRouter>
    </StoreProvider>
  );
}

export default function App() {
  // SessionProvider is OUTSIDE the store on purpose: the data now lives in
  // Supabase behind row-level security, so nothing can be read until someone
  // is signed in. Mounting the store first would fire loadDB() as an
  // anonymous caller, get nothing back, and seed a fresh database over the
  // shared one.
  return (
    <SessionProvider>
      <Gate />
    </SessionProvider>
  );
}
