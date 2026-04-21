import { HashRouter, Route, Routes } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import { Dashboard } from "./routes/Dashboard";

function Placeholder({ title }: { title: string }): JSX.Element {
  return <div className="p-8"><h1 className="text-3xl font-semibold tracking-tight">{title}</h1></div>;
}

export default function App(): JSX.Element {
  return (
    <HashRouter>
      <div className="flex h-screen">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/duplicates-exact" element={<Placeholder title="Exact duplicates" />} />
            <Route path="/misplaced" element={<Placeholder title="Misplaced by date" />} />
            <Route path="/zero-byte" element={<Placeholder title="Zero-byte" />} />
            <Route path="/apply" element={<Placeholder title="Apply" />} />
            <Route path="/sessions" element={<Placeholder title="Sessions" />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
}
