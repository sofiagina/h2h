import { LazyMotion, MotionConfig } from 'motion/react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/core/auth/AuthContext';
import { AccountPage } from '@/features/account/AccountPage';
import { AdminPage } from '@/features/admin/AdminPage';
import { LoginPage } from '@/features/auth/LoginPage';
import { EventPage } from '@/features/catalog/EventPage';
import { HomePage } from '@/features/catalog/HomePage';
import { DisputePage } from '@/features/disputes/DisputePage';
import { HowItWorksPage } from '@/features/info/HowItWorksPage';
import { NotFoundPage } from '@/features/info/NotFoundPage';
import { CheckoutPage } from '@/features/orders/CheckoutPage';
import { OrderPage } from '@/features/orders/OrderPage';
import { SellPage } from '@/features/sell/SellPage';
import { Layout } from '@/layout/Layout';

/** Анимации грузятся отдельным файлом после старта — первый экран от них не зависит. */
const loadMotion = () => import('@/shared/lib/motionFeatures').then((r) => r.default);

export function App() {
  return (
    <LazyMotion features={loadMotion} strict>
      <MotionConfig reducedMotion="user">
        <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <AuthProvider>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<HomePage />} />
                <Route path="events/:id" element={<EventPage />} />
                <Route path="checkout/:orderId" element={<CheckoutPage />} />
                <Route path="orders/:orderId" element={<OrderPage />} />
                <Route path="disputes/:orderId" element={<DisputePage />} />
                <Route path="sell" element={<SellPage />} />
                <Route path="how" element={<HowItWorksPage />} />
                <Route path="login" element={<LoginPage />} />
                <Route path="account" element={<AccountPage />} />
                <Route path="admin" element={<AdminPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </MotionConfig>
    </LazyMotion>
  );
}
