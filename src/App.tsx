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

function Gate() {
  const { authed } = useSession();
  // Public RSVP link — the emailed invite for guests without an account. Lives
  // outside the auth gate; an external guest lands here straight from email.
  if (typeof window !== 'undefined' && window.location.hash.startsWith('#/rsvp/')) {
    return (
      <StoreProvider>
        <HashRouter>
          <Routes>
            <Route path="/rsvp/:id" element={<Rsvp />} />
            <Route path="*" element={<Rsvp />} />
          </Routes>
        </HashRouter>
      </StoreProvider>
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
          <Route path="/athletics" element={<AthleticsWeek />} />
          <Route path="/requests" element={<Requests />} />
          <Route path="/queue" element={<Queue />} />
          <Route path="/team" element={<Team />} />
          <Route path="/my" element={<MyRequests />} />
          <Route path="/insights" element={<Insights />} />
          <Route path="/approvals" element={<Approvals />} />
          <Route path="/assets" element={<Assets />} />
          <Route path="/asset/:id" element={<AssetDetail />} />
          <Route path="/rentals" element={<Rentals />} />
          <Route path="/rental/:id" element={<RentalDetail />} />
          <Route path="/audit" element={<Audit />} />
          <Route path="/search" element={<Search />} />
          <Route path="/teams" element={<Teams />} />
          <Route path="/crew/:teamId" element={<CrewTeamDetail />} />
          <Route path="/my-schedule" element={<MySchedule />} />
          <Route path="/programs" element={<Programs />} />
          <Route path="/program/:id" element={<ProgramDetail />} />
          <Route path="/security" element={<Security />} />
          <Route path="/invites" element={<MyInvites />} />
          <Route path="/work/:id" element={<WorkDetail />} />
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
