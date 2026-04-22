import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { Toaster } from "./components/ui/Toaster";
import { ArchiveProvider } from "./state/ArchiveContext";
import { ToastProvider } from "./state/ToastContext";
import { Dashboard } from "./routes/Dashboard";

export default function App(): JSX.Element {
  return (
    <ToastProvider>
      <ArchiveProvider>
        <HashRouter>
          <AppShell>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AppShell>
          <Toaster />
        </HashRouter>
      </ArchiveProvider>
    </ToastProvider>
  );
}
