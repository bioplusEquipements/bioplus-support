import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import RoleRoute from './components/RoleRoute';
import Layout from './components/Layout';
import AutomateScanner from './components/AutomateScanner';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import GalaxyView from './pages/GalaxyView';
import TicketCreation from './pages/TicketCreation';
import TicketDetail from './pages/TicketDetail';
import AdminUsers from './pages/AdminUsers';
import Reclamations from './pages/Reclamations';
import Clients from './pages/Clients';
import ClientDetail from './pages/ClientDetail';
import Alarms from './pages/Alarms';
import Analytics from './pages/Analytics';
import Automates from './pages/Automates';

const basename = window.location.pathname.startsWith('/bioplus-support')
  ? '/bioplus-support'
  : '/';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter basename={basename}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/galaxy" element={<GalaxyView />} />
              <Route path="/automate/:id" element={<AutomateScanner />} />
              <Route path="/ticket/new" element={<TicketCreation />} />
              <Route path="/ticket/:id" element={<TicketDetail />} />
              <Route element={<RoleRoute roles={['admin']} />}>
                <Route path="/users" element={<AdminUsers />} />
                <Route path="/reclamations" element={<Reclamations />} />
                <Route path="/clients" element={<Clients />} />
                <Route path="/client/:id" element={<ClientDetail />} />
                <Route path="/alarms" element={<Alarms />} />
                <Route path="/analytics" element={<Analytics />} />
              </Route>
              <Route element={<RoleRoute roles={['responsable', 'admin']} />}>
                <Route path="/automates" element={<Automates />} />
              </Route>
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}