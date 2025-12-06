/**
 * FileService Unit Tests
 * Updated for Phase 2 State Management Migration
 */

import { MockIPCAdapter } from "@test-helpers/MockIPCAdapter.js";
import { MockStorageAdapter } from "@test-helpers/MockStorageAdapter.js";
import { beforeEach, describe, expect, it } from "vitest";
import { AppState } from "@/core/state.js";
import { FileService } from "@/services/file-service.js";

describe("FileService", () => {
  let fileService;
  let mockIPC;
  let mockStorage;
  let appState;

  beforeEach(() => {
    mockIPC = new MockIPCAdapter();
    mockStorage = new MockStorageAdapter();
    appState = new AppState();

    fileService = new FileService({
      ipcAdapter: mockIPC,
      storageAdapter: mockStorage,
      appState,
    });
  });

  describe("constructor", () => {
    it("should initialize with adapters and appState", () => {
      expect(fileService.ipc).toBe(mockIPC);
      expect(fileService.storage).toBe(mockStorage);
      expect(fileService.appState).toBe(appState);
    });

    it("should initialize file cache and have activeDirectory in AppState", () => {
      expect(appState.getState("files.activeDirectory")).toBeNull();
      expect(fileService.fileCache).toBeInstanceOf(Map);
    });
  });

  describe("validateFile", () => {
    const createMockFile = (name, size) => ({ name, size });

    it("should validate valid file", () => {
      const file = createMockFile("test.txt", 1024);

      const result = fileService.validateFile(file);

      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
    });

    it("should reject null file", () => {
      const result = fileService.validateFile(null);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("No file");
    });

    it("should reject file without name", () => {
      const file = createMockFile("", 1024);

      const result = fileService.validateFile(file);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("no name");
    });

    it("should reject empty file", () => {
      const file = createMockFile("test.txt", 0);

      const result = fileService.validateFile(file);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("empty");
    });

    it("should reject file exceeding max size", () => {
      const file = createMockFile("test.txt", 200 * 1024 * 1024); // 200MB

      const result = fileService.validateFile(file, { maxSize: 100 * 1024 * 1024 });

      expect(result.valid).toBe(false);
      expect(result.error).toContain("too large");
    });

    it("should accept file within max size", () => {
      const file = createMockFile("test.txt", 50 * 1024 * 1024); // 50MB

      const result = fileService.validateFile(file, { maxSize: 100 * 1024 * 1024 });

      expect(result.valid).toBe(true);
    });

    it("should reject disallowed file extension", () => {
      const file = createMockFile("test.exe", 1024);

      const result = fileService.validateFile(file, { allowedExtensions: ["pdf", "txt"] });

      expect(result.valid).toBe(false);
      expect(result.error).toContain("not allowed");
    });

    it("should accept allowed file extension", () => {
      const file = createMockFile("test.pdf", 1024);

      const result = fileService.validateFile(file, { allowedExtensions: ["pdf", "txt"] });

      expect(result.valid).toBe(true);
    });
  });

  describe("getFileExtension", () => {
    it("should extract file extension", () => {
      expect(fileService.getFileExtension("test.txt")).toBe("txt");
      expect(fileService.getFileExtension("document.pdf")).toBe("pdf");
      expect(fileService.getFileExtension("archive.tar.gz")).toBe("gz");
    });

    it("should handle no extension", () => {
      expect(fileService.getFileExtension("README")).toBe("");
    });

    it("should handle invalid input", () => {
      expect(fileService.getFileExtension(null)).toBe("");
      expect(fileService.getFileExtension("")).toBe("");
    });
  });

  describe("getFileIcon", () => {
    it("should return correct icon for documents", () => {
      expect(fileService.getFileIcon("test.pdf")).toBe("pdf");
      expect(fileService.getFileIcon("doc.docx")).toBe("doc");
      expect(fileService.getFileIcon("readme.txt")).toBe("text");
      expect(fileService.getFileIcon("notes.md")).toBe("markdown");
    });

    it("should return correct icon for code files", () => {
      expect(fileService.getFileIcon("app.js")).toBe("code");
      expect(fileService.getFileIcon("component.tsx")).toBe("code");
      expect(fileService.getFileIcon("script.py")).toBe("code");
    });

    it("should return correct icon for images", () => {
      expect(fileService.getFileIcon("photo.jpg")).toBe("image");
      expect(fileService.getFileIcon("logo.png")).toBe("image");
      expect(fileService.getFileIcon("diagram.svg")).toBe("image");
    });

    it("should return correct icon for archives", () => {
      expect(fileService.getFileIcon("data.zip")).toBe("archive");
      expect(fileService.getFileIcon("backup.tar")).toBe("archive");
      expect(fileService.getFileIcon("compressed.gz")).toBe("archive");
    });

    it("should return default icon for unknown types", () => {
      expect(fileService.getFileIcon("unknown.xyz")).toBe("file");
      expect(fileService.getFileIcon("noextension")).toBe("file");
    });
  });

  describe("formatFileSize", () => {
    it("should format bytes", () => {
      expect(fileService.formatFileSize(100)).toBe("100 B");
      expect(fileService.formatFileSize(512)).toBe("512 B");
    });

    it("should format kilobytes", () => {
      expect(fileService.formatFileSize(1024)).toBe("1.0 KB");
      expect(fileService.formatFileSize(5120)).toBe("5.0 KB");
    });

    it("should format megabytes", () => {
      expect(fileService.formatFileSize(1024 * 1024)).toBe("1.0 MB");
      expect(fileService.formatFileSize(5 * 1024 * 1024)).toBe("5.0 MB");
    });

    it("should format gigabytes", () => {
      expect(fileService.formatFileSize(1024 * 1024 * 1024)).toBe("1.0 GB");
    });

    it("should handle invalid input", () => {
      expect(fileService.formatFileSize(-1)).toBe("0 B");
      expect(fileService.formatFileSize(null)).toBe("0 B");
    });
  });

  describe("uploadFile", () => {
    const createMockFile = (name, size) => ({
      name,
      size,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(size)),
      type: "text/plain",
    });

    it("should upload valid file", async () => {
      const file = createMockFile("test.txt", 1024);
      mockIPC.setResponse("uploadFile", { success: true });

      const result = await fileService.uploadFile(file, "session-123");

      expect(result.success).toBe(true);
    });

    it("should reject invalid file", async () => {
      const file = createMockFile("test.txt", 0); // Empty file

      const result = await fileService.uploadFile(file, "session-123");

      expect(result.success).toBe(false);
      expect(result.error).toContain("empty");
    });

    it("should require session ID", async () => {
      const file = createMockFile("test.txt", 1024);

      const result = await fileService.uploadFile(file, null);

      expect(result.success).toBe(false);
      expect(result.error).toContain("session ID");
    });

    it("should handle upload errors", async () => {
      const file = createMockFile("test.txt", 1024);
      mockIPC.setResponse("uploadFile", { success: false, error: "Upload failed" });

      const result = await fileService.uploadFile(file, "session-123");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Upload failed");
    });
  });

  describe("loadFiles", () => {
    it("should load files from directory", async () => {
      mockIPC.setResponse("load-files", {
        files: [
          { name: "file1.txt", size: 1024 },
          { name: "file2.pdf", size: 2048 },
        ],
      });

      const result = await fileService.loadFiles("sources", "session-123");

      expect(result.success).toBe(true);
      expect(result.files).toHaveLength(2);
      expect(appState.getState("files.activeDirectory")).toBe("sources");
    });

    it("should require session ID", async () => {
      const result = await fileService.loadFiles("sources", null);

      expect(result.success).toBe(false);
      expect(result.error).toContain("session ID");
    });

    it("should cache loaded files", async () => {
      mockIPC.setResponse("load-files", {
        files: [{ name: "file1.txt", size: 1024 }],
      });

      await fileService.loadFiles("sources", "session-123");

      const cached = fileService.getCachedFileList("sources");
      expect(cached).toHaveLength(1);
    });

    it("should handle load errors", async () => {
      mockIPC.setResponse("load-files", new Error("Load failed"));

      const result = await fileService.loadFiles("sources", "session-123");

      expect(result.success).toBe(false);
      expect(result.files).toEqual([]);
    });
  });

  describe("deleteFile", () => {
    it("should delete file", async () => {
      mockIPC.setResponse("deleteFile", { success: true });

      const result = await fileService.deleteFile("test.txt", "sources", "session-123");

      expect(result.success).toBe(true);
    });

    it("should require filename", async () => {
      const result = await fileService.deleteFile("", "sources", "session-123");

      expect(result.success).toBe(false);
      expect(result.error).toContain("filename");
    });

    it("should require session ID", async () => {
      const result = await fileService.deleteFile("test.txt", "sources", null);

      expect(result.success).toBe(false);
      expect(result.error).toContain("session ID");
    });

    it("should update cache after deletion", async () => {
      // Setup cache
      fileService.cacheFileList("sources", [{ name: "file1.txt" }, { name: "file2.txt" }]);

      mockIPC.setResponse("deleteFile", { success: true });

      await fileService.deleteFile("file1.txt", "sources", "session-123");

      const cached = fileService.getCachedFileList("sources");
      expect(cached).toHaveLength(1);
      expect(cached[0].name).toBe("file2.txt");
    });
  });

  describe("openFile", () => {
    it("should open file", async () => {
      mockIPC.setResponse("openFile", { success: true });

      const result = await fileService.openFile("/path/to/file.txt");

      expect(result.success).toBe(true);
    });

    it("should require file path", async () => {
      const result = await fileService.openFile("");

      expect(result.success).toBe(false);
      expect(result.error).toContain("file path");
    });
  });

  describe("cacheFileList", () => {
    it("should cache file list", () => {
      const files = [{ name: "file1.txt" }, { name: "file2.txt" }];

      fileService.cacheFileList("sources", files);

      const cached = fileService.getCachedFileList("sources");
      expect(cached).toEqual(files);
    });
  });

  describe("getCachedFileList", () => {
    it("should return cached files", () => {
      const files = [{ name: "file1.txt" }];
      fileService.cacheFileList("sources", files);

      const cached = fileService.getCachedFileList("sources");

      expect(cached).toEqual(files);
    });

    it("should return null for non-cached directory", () => {
      const cached = fileService.getCachedFileList("non-existent");

      expect(cached).toBeNull();
    });

    it("should expire old cache", () => {
      const files = [{ name: "file1.txt" }];
      fileService.cacheFileList("sources", files);

      // Get with very short max age
      const cached = fileService.getCachedFileList("sources", 0);

      expect(cached).toBeNull();
    });
  });

  describe("clearFileCache", () => {
    it("should clear specific directory cache", () => {
      fileService.cacheFileList("sources", [{ name: "file1.txt" }]);
      fileService.cacheFileList("output", [{ name: "file2.txt" }]);

      fileService.clearFileCache("sources");

      expect(fileService.getCachedFileList("sources")).toBeNull();
      expect(fileService.getCachedFileList("output")).not.toBeNull();
    });

    it("should clear all caches", () => {
      fileService.cacheFileList("sources", [{ name: "file1.txt" }]);
      fileService.cacheFileList("output", [{ name: "file2.txt" }]);

      fileService.clearFileCache();

      expect(fileService.getCachedFileList("sources")).toBeNull();
      expect(fileService.getCachedFileList("output")).toBeNull();
    });
  });

  describe("getActiveDirectory", () => {
    it("should return active directory from AppState", () => {
      fileService.setActiveDirectory("sources");

      expect(fileService.getActiveDirectory()).toBe("sources");
      expect(appState.getState("files.activeDirectory")).toBe("sources");
    });

    it("should return null initially", () => {
      expect(fileService.getActiveDirectory()).toBeNull();
    });
  });

  describe("setActiveDirectory", () => {
    it("should set active directory in AppState", () => {
      fileService.setActiveDirectory("output");

      expect(appState.getState("files.activeDirectory")).toBe("output");
    });
  });

  describe("reset", () => {
    it("should reset all service state in AppState", () => {
      fileService.setActiveDirectory("sources");
      fileService.cacheFileList("sources", [{ name: "file1.txt" }]);

      fileService.reset();

      expect(appState.getState("files.activeDirectory")).toBeNull();
      expect(fileService.getCachedFileList("sources")).toBeNull();
    });
  });
});
