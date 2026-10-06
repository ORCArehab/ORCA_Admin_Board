import { describe, expect, it } from "vitest";
import { fileDetail, fileKind, fileSize, uploadProblem } from "./documents";

describe("document labels", () => {
  it("describe files briefly", () => {
    expect(fileDetail({ mimeType: "application/pdf", size: 1_258_291, modifiedTime: "2026-10-05T19:00:00Z" })).toBe("PDF · 1.2 MB · Oct 5, 2026");
    expect(fileDetail({ mimeType: "application/x-unknown", size: null, modifiedTime: null })).toBe("");
    expect([fileKind("image/png"), fileKind("application/vnd.openxmlformats-officedocument.wordprocessingml.document")]).toEqual(["Image", "Document"]);
    expect([fileSize(900), fileSize(20_480), fileSize(4 * 1024 * 1024)]).toEqual(["900 B", "20 KB", "4.0 MB"]);
  });
});

describe("upload checks", () => {
  const file = (bytes: number) => new File([new Uint8Array(bytes)], "a.pdf", { type: "application/pdf" });
  it("need a non-empty file under 4 MB and a category", () => {
    expect(uploadProblem(null, "other")).toBe("Choose a file.");
    expect(uploadProblem(file(0), "other")).toBe("That file is empty.");
    expect(uploadProblem(file(4 * 1024 * 1024 + 1), "other")).toMatch(/4 MB or smaller/);
    expect(uploadProblem(file(10), null)).toMatch(/Credentials, Contracts or Other/);
    expect(uploadProblem(file(10), "contracts")).toBeNull();
  });
});
