import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { Toaster } from "./components/ui/Toaster";
import { ArchiveProvider } from "./state/ArchiveContext";
import { ToastProvider } from "./state/ToastContext";
import { Apply } from "./routes/Apply";
import { Dashboard } from "./routes/Dashboard";
import { DuplicatesExact } from "./routes/DuplicatesExact";
import { MisplacedByDate } from "./routes/MisplacedByDate";
import { Sessions } from "./routes/Sessions";
import { ZeroByte } from "./routes/ZeroByte";

export default function App(): JSX.Element {
  return (
    <ToastProvider>
      <ArchiveProvider>
        <HashRouter>
          <AppShell>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/dashboard" element={<Navigate to="/" replace />} />
              <Route path="/duplicates" element={<Navigate to="/duplicates-exact" replace />} />
              <Route path="/duplicates-exact" element={<DuplicatesExact />} />
              <Route path="/misplaced" element={<MisplacedByDate />} />
              <Route path="/zero-byte" element={<ZeroByte />} />
              <Route path="/apply" element={<Apply />} />
              <Route path="/sessions" element={<Sessions />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AppShell>
          <Toaster />
        </HashRouter>
      </ArchiveProvider>
    </ToastProvider>
  );
}
