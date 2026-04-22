import React from "react";
import { useArchive } from "../../state/ArchiveContext";
import { Button } from "../ui/Button";
import { Card, CardBody } from "../ui/Card";

export const NoArchiveState: React.FC = () => {
  const { pickArchive } = useArchive();
  return (
    <Card>
      <CardBody className="flex flex-col items-center gap-4 px-6 py-16 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-neutral-800 bg-neutral-950 text-neutral-500">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 7h6l2 2h10v10a2 2 0 01-2 2H3V7z" />
          </svg>
        </div>
        <div className="max-w-sm space-y-1">
          <div className="text-[13px] font-semibold text-neutral-200">No archive selected</div>
          <div className="text-[12.5px] leading-relaxed text-neutral-500">
            Curator operates on a single archive root at a time. Select a folder to begin analysis.
            Your selection is remembered locally — no data leaves this machine.
          </div>
        </div>
        <Button variant="primary" size="md" onClick={pickArchive}>
          Select Archive Folder
        </Button>
      </CardBody>
    </Card>
  );
};
