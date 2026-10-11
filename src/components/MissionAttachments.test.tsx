import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MissionAttachments } from "./MissionAttachments";

const mocks = vi.hoisted(() => ({ query: vi.fn(), download: vi.fn(), toast: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: mocks.toast } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ order: mocks.query }) }) }),
    storage: { from: () => ({ download: mocks.download }) },
  },
}));

const reference = {
  id: "reference-1",
  mission_id: "mission-1",
  storage_path: "sponsor/mission-1/reference",
  file_name: "route.pdf",
  content_type: "application/pdf",
  size_bytes: 1024,
  sha256: "a".repeat(64),
  created_at: "2026-10-11T12:00:00Z",
};

describe("mission reference files", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("downloads the sponsor reference with its original filename", async () => {
    mocks.query.mockResolvedValue({ data: [reference], error: null });
    mocks.download.mockResolvedValue({
      data: new Blob(["reference"], { type: "application/pdf" }),
      error: null,
    });
    const createObjectURL = vi.fn(() => "blob:mission-reference");
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL: vi.fn() });
    let savedName = "";
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      savedName = this.download;
    });
    render(<MissionAttachments missionId="mission-1" />);
    fireEvent.click(await screen.findByRole("button", { name: /route.pdf/ }));
    await waitFor(() => expect(savedName).toBe("route.pdf"));
    expect(mocks.download).toHaveBeenCalledWith(reference.storage_path);
    expect(screen.getByText(/not completion evidence/)).toBeTruthy();
  });

  it("offers retry after a failed reference query", async () => {
    mocks.query
      .mockResolvedValueOnce({ data: null, error: { message: "offline" } })
      .mockResolvedValueOnce({ data: [reference], error: null });
    render(<MissionAttachments missionId="mission-1" />);
    fireEvent.click(await screen.findByRole("button", { name: /Try again/ }));
    expect(await screen.findByRole("button", { name: /route.pdf/ })).toBeTruthy();
  });

  it("does not add an empty reference section to existing missions", async () => {
    mocks.query.mockResolvedValue({ data: [], error: null });
    render(<MissionAttachments missionId="mission-without-references" />);
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    expect(screen.queryByRole("region", { name: "Mission reference attachments" })).toBeNull();
  });
});
