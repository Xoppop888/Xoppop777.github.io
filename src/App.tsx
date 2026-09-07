import { HashRouter, Routes, Route, Link } from "react-router-dom";
import { AppProvider } from "./state/AppContext";
import { ToastProvider, Button } from "./components/ui";
import Layout from "./components/Layout";
import LandingPage from "./pages/LandingPage";
import CalculatorPage from "./pages/CalculatorPage";
import CalculationsPage from "./pages/CalculationsPage";
import CalculationDetailPage from "./pages/CalculationDetailPage";
import ProfilePage from "./pages/ProfilePage";
import AdminPage from "./pages/AdminPage";
import LoginPage from "./pages/LoginPage";

function NotFound() {
  return (
    <div className="max-w-md mx-auto px-4 py-24 text-center">
      <p className="font-display text-5xl font-bold text-gold-500">404</p>
      <p className="font-display text-lg font-semibold text-ink-50 mt-3">Страница не найдена</p>
      <Link to="/">
        <Button className="mt-6">На главную</Button>
      </Link>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <ToastProvider>
        <HashRouter>
          <Layout>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/calculator" element={<CalculatorPage />} />
              <Route path="/calculations" element={<CalculationsPage />} />
              <Route path="/calculations/:id" element={<CalculationDetailPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/admin" element={<AdminPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Layout>
        </HashRouter>
      </ToastProvider>
    </AppProvider>
  );
}
