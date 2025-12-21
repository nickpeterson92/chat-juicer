import { describe, expect, it, vi } from "vitest";
import { base64ToFile, formatFileSize, getFileIcon } from "../../../../src/frontend/renderer/utils/file-utils.js";

// Mock the dependencies
vi.mock("../../../../src/frontend/renderer/utils/file-icon-colors.js", () => ({
  getFileIconColor: vi.fn().mockReturnValue("var(--color-icon)"),
  resolveFileIconColor: vi.fn().mockReturnValue("#ffffff"),
}));

describe("file-utils", () => {
  describe("getFileIcon", () => {
    it("should return correct SVG for PDF files", () => {
      const icon = getFileIcon("test.pdf");
      expect(icon).toContain("<svg");
      expect(icon).toContain('path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"');
    });

    it("should return correct SVG for Word documents", () => {
      const extensions = ["doc", "docx", "odt"];
      extensions.forEach((ext) => {
        const icon = getFileIcon(`test.${ext}`);
        expect(icon).toContain("<svg");
      });
    });

    it("should return correct SVG for Spreadsheets", () => {
      const extensions = ["xls", "xlsx", "csv", "ods"];
      extensions.forEach((ext) => {
        const icon = getFileIcon(`test.${ext}`);
        expect(icon).toContain("<svg");
      });
    });

    it("should return correct SVG for Presentations", () => {
      const extensions = ["ppt", "pptx", "odp"];
      extensions.forEach((ext) => {
        const icon = getFileIcon(`test.${ext}`);
        expect(icon).toContain("<svg");
      });
    });

    it("should return correct SVG for Images", () => {
      const extensions = ["jpg", "jpeg", "png", "gif", "bmp", "svg", "webp", "ico"];
      extensions.forEach((ext) => {
        const icon = getFileIcon(`test.${ext}`);
        expect(icon).toContain("<svg");
        expect(icon).toContain('circle cx="8.5" cy="8.5"');
      });
    });

    it("should return correct SVG for Code files", () => {
      const extensions = [
        "js",
        "jsx",
        "ts",
        "tsx",
        "py",
        "java",
        "c",
        "cpp",
        "cs",
        "go",
        "rb",
        "php",
        "swift",
        "kt",
        "rs",
      ];
      extensions.forEach((ext) => {
        const icon = getFileIcon(`test.${ext}`);
        expect(icon).toContain("<svg");
      });
    });

    it("should return correct SVG for Markup/Data files", () => {
      const extensions = ["html", "xml", "json", "yaml", "yml", "toml", "ini", "md", "txt"];
      extensions.forEach((ext) => {
        const icon = getFileIcon(`test.${ext}`);
        expect(icon).toContain("<svg");
      });
    });

    it("should return correct SVG for Archives", () => {
      const extensions = ["zip", "rar", "7z", "tar", "gz", "bz2"];
      extensions.forEach((ext) => {
        const icon = getFileIcon(`test.${ext}`);
        expect(icon).toContain("<svg");
      });
    });

    it("should return correct SVG for Video files", () => {
      const extensions = ["mp4", "avi", "mov", "mkv", "webm", "flv"];
      extensions.forEach((ext) => {
        const icon = getFileIcon(`test.${ext}`);
        expect(icon).toContain("<svg");
      });
    });

    it("should return correct SVG for Audio files", () => {
      const extensions = ["mp3", "wav", "flac", "aac", "ogg", "m4a"];
      extensions.forEach((ext) => {
        const icon = getFileIcon(`test.${ext}`);
        expect(icon).toContain("<svg");
      });
    });

    it("should return default SVG for unknown extensions", () => {
      const icon = getFileIcon("test.unknown");
      expect(icon).toContain("<svg");
    });

    it("should handle files without extensions", () => {
      const icon = getFileIcon("README");
      expect(icon).toContain("<svg");
    });
  });

  describe("formatFileSize", () => {
    it("should format 0 bytes", () => {
      expect(formatFileSize(0)).toBe("0 B");
    });

    it("should format bytes", () => {
      expect(formatFileSize(500)).toBe("500 B");
    });

    it("should format kilobytes", () => {
      expect(formatFileSize(1024)).toBe("1 KB");
      expect(formatFileSize(1536)).toBe("1.5 KB");
    });

    it("should format megabytes", () => {
      expect(formatFileSize(1024 * 1024)).toBe("1 MB");
      expect(formatFileSize(2.5 * 1024 * 1024)).toBe("2.5 MB");
    });

    it("should format gigabytes", () => {
      expect(formatFileSize(1024 * 1024 * 1024)).toBe("1 GB");
    });
  });

  describe("base64ToFile", () => {
    it("should convert a base64 string to a File object correctly", () => {
      // "Hello World" in base64
      const base64Data = "SGVsbG8gV29ybGQ=";
      const filename = "test.txt";
      const mimeType = "text/plain";

      const file = base64ToFile(base64Data, filename, mimeType);

      expect(file).toBeDefined();
      expect(file).toBeInstanceOf(File);
      expect(file.name).toBe(filename);
      expect(file.type).toBe(mimeType);

      // Async verify content if needed, but basic sync properties are good for now.
      // We can trust Blob/File constructor if properties match.
      expect(file.size).toBe(11); // "Hello World".length
    });

    it("should handle empty content", () => {
      const base64Data = "";
      const filename = "empty.txt";
      const mimeType = "text/plain";

      const file = base64ToFile(base64Data, filename, mimeType);

      expect(file).toBeInstanceOf(File);
      expect(file.size).toBe(0);
    });
  });
});
