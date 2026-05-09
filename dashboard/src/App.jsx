import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginScreen    from './components/LoginScreen';
import IndexPage      from './pages/IndexPage';
import StationPage    from './pages/StationPage';
import AdminStationsPage from './pages/AdminStationsPage';

const PASSWORD = import.meta.env.VITE_DASHBOARD_PASSWORD;

function Auth({ children }) {
  const [authed, setAuthed] = useState(() => {
    if (!PASSWORD) return true;
    return sessionStorage.getItem('sts_auth') === 'true';
  });

  if (!authed) {
    return (
      <LoginScreen
        onLogin={(pw) => {
          if (pw === PASSWORD) {
            sessionStorage.setItem('sts_auth', 'true');
            setAuthed(true);
            return true;
          }
          return false;
        }}
      />
    );
  }

  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Auth>
        <Routes>
          <Route path="/"                element={<IndexPage />}         />
          <Route path="/station/:id"     element={<StationPage />}       />
          <Route path="/admin/stations"  element={<AdminStationsPage />} />
          <Route path="*"                element={<Navigate to="/" replace />} />
        </Routes>
      </Auth>
    </BrowserRouter>
  );
}
