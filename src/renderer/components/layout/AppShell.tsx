import React from "react";

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <div className="h-screen w-screen overflow-hidden bg-neutral-950 text-neutral-200">{children}</div>;
};
