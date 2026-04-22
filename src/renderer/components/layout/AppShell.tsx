import React from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-neutral-950 text-neutral-200">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="min-h-0 flex-1 overflow-auto">
          <div className="mx-auto w-full max-w-[1280px] px-6 py-6">{children}</div>
        </main>
      </div>
    </div>
  );
};
