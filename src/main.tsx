import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { Layout } from './components/Layout';
import { Account } from './pages/Account';
import { Admin } from './pages/Admin';
import { Checkout } from './pages/Checkout';
import { EventPage } from './pages/EventPage';
import { Home } from './pages/Home';
import { Login } from './pages/Login';
import { OrderPage } from './pages/OrderPage';
import { Sell } from './pages/Sell';
import './styles.css';

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
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <AuthProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="events/:id" element={<EventPage />} />
            <Route path="checkout/:orderId" element={<Checkout />} />
            <Route path="orders/:orderId" element={<OrderPage />} />
            <Route path="sell" element={<Sell />} />
            <Route path="login" element={<Login />} />
            <Route path="account" element={<Account />} />
            <Route path="admin" element={<Admin />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
