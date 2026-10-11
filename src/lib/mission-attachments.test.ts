import { describe, expect, it } from "vitest";
import { attachmentContentType, validateMissionAttachments } from "./mission-attachments";

describe("mission reference attachments", () => {
  it("accepts no files and common reference formats, including uppercase extensions", () => {
    expect(() => validateMissionAttachments([])).not.toThrow();
    expect(() =>
      validateMissionAttachments([
        { name: "route.PDF", size: 400 },
        { name: "site.jpg", size: 100 },
        { name: "checklist.docx", size: 300 },
      ]),
    ).not.toThrow();
    expect(attachmentContentType("route.PDF")).toBe("application/pdf");
  });
  it("rejects active web content and unsupported file types", () => {
    for (const name of ["instructions.html", "diagram.svg", "run.exe", "noextension"])
      expect(() => validateMissionAttachments([{ name, size: 100 }])).toThrow("Use images");
  });
  it("enforces count, per-file, total size, empty file, and filename limits", () => {
    const file = { name: "site.png", size: 10 * 1024 * 1024 };
    expect(() => validateMissionAttachments(Array(6).fill({ ...file, size: 1 }))).toThrow(
      "up to 5",
    );
    expect(() => validateMissionAttachments([{ ...file, size: file.size + 1 }])).toThrow("10 MB");
    expect(() => validateMissionAttachments(Array(3).fill(file))).toThrow("25 MB");
    expect(() => validateMissionAttachments([{ ...file, size: 0 }])).toThrow("nonempty");
    expect(() => validateMissionAttachments([{ ...file, name: "x".repeat(200) + ".png" }])).toThrow(
      "200 characters",
    );
  });
});
