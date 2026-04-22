import { HashRouter, Route, Routes } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import { Apply } from "./routes/Apply";
import { Dashboard } from "./routes/Dashboard";
import { DuplicatesExact } from "./routes/DuplicatesExact";
import { MisplacedByDate } from "./routes/MisplacedByDate";
import { Sessions } from "./routes/Sessions";
import { ZeroByte } from "./routes/ZeroByte";

export default function App(): JSX.Element {
  return (
    <HashRouter>
      <div className="flex h-screen">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/duplicates-exact" element={<DuplicatesExact />} />
            <Route path="/misplaced" element={<MisplacedByDate />} />
            <Route path="/zero-byte" element={<ZeroByte />} />
            <Route path="/apply" element={<Apply />} />
            <Route path="/sessions" element={<Sessions />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
}
