import type { Proposal, Session } from "@shared/types";

export function stripIpcPrefix(raw: string): string {
  return raw.replace(/^Error invoking remote method '[^']+':\s*/, "");
}

export function countProposalActions(proposals: Proposal[]): Record<Proposal["action"], number> {
  return proposals.reduce<Record<Proposal["action"], number>>(
    (acc, proposal) => {
      acc[proposal.action] += 1;
      return acc;
    },
    { quarantine: 0, move_to_year: 0 },
  );
}

export function sessionStatus(session: Session): "active" | "complete" {
  return session.completed_at ? "complete" : "active";
}
