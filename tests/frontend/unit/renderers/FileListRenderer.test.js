/**
 * FileListRenderer Unit Tests
 */

import { MockDOMAdapter } from "@test-helpers/MockDOMAdapter.js";
import { beforeEach, describe, expect, it } from "vitest";
import {
  findFileElement,
  formatFileSize,
  getFileIcon,
  removeFileItem,
  renderFileItem,
  renderFileList,
  updateFileStatus,
} from "@/ui/renderers/file-list-renderer.js";

describe("FileListRenderer", () => {
  let mockDOM;

  beforeEach(() => {
    mockDOM = new MockDOMAdapter();
  });

  describe("getFileIcon", () => {
    it("should return icon for known file types", () => {
      expect(getFileIcon(".js")).toContain("svg");
      expect(getFileIcon(".py")).toContain("svg");
      expect(getFileIcon(".json")).toContain("svg");
      expect(getFileIcon(".md")).toContain("svg");
    });

    it("should handle extensions with or without dot", () => {
      expect(getFileIcon("js")).toContain("svg");
      expect(getFileIcon(".js")).toContain("svg");
    });

    it("should return default icon for unknown types", () => {
      const icon = getFileIcon(".xyz");
      expect(icon).toContain("svg");
    });

    it("should be case insensitive", () => {
      expect(getFileIcon(".JS")).toContain("svg");
      expect(getFileIcon(".Js")).toContain("svg");
    });
  });

  describe("formatFileSize", () => {
    it("should format bytes", () => {
      expect(formatFileSize(512)).toBe("512 B");
      expect(formatFileSize(1023)).toBe("1023 B");
    });

    it("should format kilobytes", () => {
      expect(formatFileSize(1024)).toBe("1.0 KB");
      expect(formatFileSize(1536)).toBe("1.5 KB");
      expect(formatFileSize(10240)).toBe("10.0 KB");
    });

    it("should format megabytes", () => {
      expect(formatFileSize(1048576)).toBe("1.0 MB");
      expect(formatFileSize(5242880)).toBe("5.0 MB");
    });

    it("should format gigabytes", () => {
      expect(formatFileSize(1073741824)).toBe("1.0 GB");
      expect(formatFileSize(2147483648)).toBe("2.0 GB");
    });

    it("should handle zero bytes", () => {
      expect(formatFileSize(0)).toBe("0 B");
    });

    it("should handle undefined size", () => {
      expect(formatFileSize(undefined)).toBe("--");
      expect(formatFileSize(null)).toBe("--");
    });
  });

  describe("renderFileItem", () => {
    it("should render basic file item", () => {
      const file = {
        id: "file-123",
        name: "test.js",
        path: "/path/to/test.js",
        size: 1024,
        status: "loaded",
      };

      const element = renderFileItem(file, mockDOM);

      expect(element).toBeDefined();
      expect(mockDOM.getAttribute(element, "data-file-id")).toBe("file-123");
      expect(mockDOM.hasClass(element, "file-item")).toBe(true);
    });

    it("should render file name", () => {
      const file = {
        id: "file-456",
        name: "document.pdf",
        path: "/docs/document.pdf",
        size: 2048,
        status: "loaded",
      };

      const element = renderFileItem(file, mockDOM);
      const nameDiv = mockDOM.querySelector(element, ".file-name");

      expect(mockDOM.getTextContent(nameDiv)).toBe("document.pdf");
    });

    it("should render file size", () => {
      const file = {
        id: "file-789",
        name: "data.json",
        path: "/data.json",
        size: 5120,
        status: "loaded",
      };

      const element = renderFileItem(file, mockDOM);
      const sizeDiv = mockDOM.querySelector(element, ".file-size");

      expect(mockDOM.getTextContent(sizeDiv)).toBe("5.0 KB");
    });

    it("should include file icon", () => {
      const file = {
        id: "file-111",
        name: "script.py",
        path: "/script.py",
        size: 1024,
        status: "loaded",
      };

      const element = renderFileItem(file, mockDOM);
      const icon = mockDOM.querySelector(element, ".file-icon");

      expect(icon).toBeDefined();
      expect(mockDOM.getInnerHTML(icon)).toContain("svg");
    });

    it("should include remove button", () => {
      const file = {
        id: "file-222",
        name: "test.txt",
        path: "/test.txt",
        size: 512,
        status: "loaded",
      };

      const element = renderFileItem(file, mockDOM);
      const removeBtn = mockDOM.querySelector(element, ".remove-file-btn");

      expect(removeBtn).toBeDefined();
      expect(mockDOM.getAttribute(removeBtn, "data-file-id")).toBe("file-222");
    });

    it("should apply status class", () => {
      const file = {
        id: "file-333",
        name: "test.txt",
        path: "/test.txt",
        size: 512,
        status: "loading",
      };

      const element = renderFileItem(file, mockDOM);

      expect(mockDOM.hasClass(element, "loading")).toBe(true);
    });
  });

  describe("renderFileList", () => {
    it("should render multiple files", () => {
      const files = [
        { id: "file-1", name: "a.txt", path: "/a.txt", size: 100, status: "loaded" },
        { id: "file-2", name: "b.txt", path: "/b.txt", size: 200, status: "loaded" },
        { id: "file-3", name: "c.txt", path: "/c.txt", size: 300, status: "loaded" },
      ];

      const fragment = renderFileList(files, mockDOM);

      expect(fragment).toBeDefined();
      expect(fragment.childNodes.length).toBe(3);
    });

    it("should handle empty file list", () => {
      const fragment = renderFileList([], mockDOM);

      expect(fragment).toBeDefined();
      expect(fragment.childNodes.length).toBe(0);
    });

    it("should preserve file order", () => {
      const files = [
        { id: "file-a", name: "alpha.txt", path: "/alpha.txt", size: 100, status: "loaded" },
        { id: "file-b", name: "beta.txt", path: "/beta.txt", size: 200, status: "loaded" },
      ];

      const fragment = renderFileList(files, mockDOM);
      const firstFile = fragment.childNodes[0];
      const secondFile = fragment.childNodes[1];

      expect(mockDOM.getAttribute(firstFile, "data-file-id")).toBe("file-a");
      expect(mockDOM.getAttribute(secondFile, "data-file-id")).toBe("file-b");
    });
  });

  describe("updateFileStatus", () => {
    it("should update status class", () => {
      const file = {
        id: "file-444",
        name: "test.txt",
        path: "/test.txt",
        size: 512,
        status: "loaded",
      };
      const element = renderFileItem(file, mockDOM);

      updateFileStatus(element, "uploading", mockDOM);

      expect(mockDOM.hasClass(element, "uploading")).toBe(true);
      expect(mockDOM.hasClass(element, "loaded")).toBe(false);
    });

    it("should handle multiple status changes", () => {
      const file = {
        id: "file-555",
        name: "test.txt",
        path: "/test.txt",
        size: 512,
        status: "pending",
      };
      const element = renderFileItem(file, mockDOM);

      updateFileStatus(element, "loading", mockDOM);
      expect(mockDOM.hasClass(element, "loading")).toBe(true);

      updateFileStatus(element, "loaded", mockDOM);
      expect(mockDOM.hasClass(element, "loaded")).toBe(true);
      expect(mockDOM.hasClass(element, "loading")).toBe(false);
    });

    it("should handle error status", () => {
      const file = {
        id: "file-666",
        name: "test.txt",
        path: "/test.txt",
        size: 512,
        status: "loaded",
      };
      const element = renderFileItem(file, mockDOM);

      updateFileStatus(element, "error", mockDOM);

      expect(mockDOM.hasClass(element, "error")).toBe(true);
    });
  });

  describe("removeFileItem", () => {
    it("should remove element from parent", () => {
      const container = mockDOM.createElement("div");
      const file = {
        id: "file-777",
        name: "test.txt",
        path: "/test.txt",
        size: 512,
        status: "loaded",
      };
      const element = renderFileItem(file, mockDOM);

      mockDOM.appendChild(container, element);
      expect(mockDOM.querySelector(container, `[data-file-id="file-777"]`)).toBeDefined();

      removeFileItem(element, mockDOM);

      expect(mockDOM.querySelector(container, `[data-file-id="file-777"]`)).toBeNull();
    });

    it("should handle element without parent", () => {
      const file = {
        id: "file-888",
        name: "test.txt",
        path: "/test.txt",
        size: 512,
        status: "loaded",
      };
      const element = renderFileItem(file, mockDOM);

      // Should not throw
      expect(() => {
        removeFileItem(element, mockDOM);
      }).not.toThrow();
    });
  });

  describe("findFileElement", () => {
    it("should find file by ID in container", () => {
      const container = mockDOM.createElement("div");
      const file1 = {
        id: "file-aaa",
        name: "first.txt",
        path: "/first.txt",
        size: 100,
        status: "loaded",
      };
      const file2 = {
        id: "file-bbb",
        name: "second.txt",
        path: "/second.txt",
        size: 200,
        status: "loaded",
      };

      mockDOM.appendChild(container, renderFileItem(file1, mockDOM));
      mockDOM.appendChild(container, renderFileItem(file2, mockDOM));

      const found = findFileElement(container, "file-bbb", mockDOM);

      expect(found).toBeDefined();
      expect(mockDOM.getAttribute(found, "data-file-id")).toBe("file-bbb");
    });

    it("should return null if file not found", () => {
      const container = mockDOM.createElement("div");

      const found = findFileElement(container, "nonexistent", mockDOM);

      expect(found).toBeNull();
    });
  });
});
