import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { LazyMotion, MotionConfig } from 'motion/react';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { Layout } from './components/Layout';
import { Account } from './pages/Account';
import { Admin } from './pages/Admin';
import { Checkout } from './pages/Checkout';
import { DisputePage } from './pages/DisputePage';
import { EventPage } from './pages/EventPage';
import { Home } from './pages/Home';
import { Login } from './pages/Login';
import { OrderPage } from './pages/OrderPage';
import { Sell } from './pages/Sell';
import { applyTheme, getTheme } from './lib/theme';
import './styles.css';

// Тему ставим до первого рендера, чтобы не мигало светлым.
applyTheme(getTheme());

const loadMotion = () => import('./lib/motionFeatures').then((r) => r.default);

function NotFound() {
  return (
    <div className="container section narrow center">
      <h1>Страница не найдена</h1>
      <Link to="/" className="btn btn--primary">На главную</Link>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LazyMotion features={loadMotion} strict>
    <MotionConfig reducedMotion="user">
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <AuthProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="events/:id" element={<EventPage />} />
            <Route path="checkout/:orderId" element={<Checkout />} />
            <Route path="orders/:orderId" element={<OrderPage />} />
            <Route path="disputes/:orderId" element={<DisputePage />} />
            <Route path="sell" element={<Sell />} />
            <Route path="login" element={<Login />} />
            <Route path="account" element={<Account />} />
            <Route path="admin" element={<Admin />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
    </MotionConfig>
    </LazyMotion>
  </StrictMode>,
);
