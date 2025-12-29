import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mocks must be hoisted
const mermaidInitializeMock = vi.fn();
const mermaidRenderMock = vi.fn();
const katexRenderMock = vi.fn();
const domPurifySanitizeMock = vi.fn((html) => `sanitized:${html}`);

// Mock dependencies
vi.mock("dompurify", () => ({
  default: {
    sanitize: domPurifySanitizeMock,
  },
}));

vi.mock("katex", () => ({
  default: {
    renderToString: katexRenderMock,
  },
}));

vi.mock("mermaid", () => ({
  default: {
    initialize: mermaidInitializeMock,
    render: mermaidRenderMock,
  },
}));

// We need to control Shiki mock per test to test fallbacks
const shikiMock = {
  getLoadedLanguages: vi.fn(() => ["js", "javascript"]),
  codeToHtml: vi.fn(() => '<pre class="shiki"><code>result</code></pre>'),
};

vi.mock("shiki", () => ({
  createHighlighter: vi.fn(() => Promise.resolve(shikiMock)),
}));

// Mock ComponentLifecycle
vi.mock("@/core/component-lifecycle.js", () => ({
  ComponentLifecycle: {
    mount: vi.fn(),
  },
}));

describe("markdown-renderer extended coverage", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  describe("Math Rendering Regex Branches", () => {
    it("should handle all math delimiter types", async () => {
      const { renderMarkdown } = await import("@/utils/markdown-renderer.js");

      const cases = [
        { input: "\\[ inverse \\]", mode: true }, // Display block \[...\]
        { input: "\\( inline \\)", mode: false }, // Inline \(...\)
        { input: "$$ display $$", mode: true }, // Display dollar
        { input: "$ inline $", mode: false }, // Inline dollar
      ];

      for (const { input, mode } of cases) {
        renderMarkdown(input, false);
        expect(katexRenderMock).toHaveBeenLastCalledWith(
          expect.stringContaining(input.replace(/\\\[|\\\]|\\\(|\\\)|$$|\$/g, "").trim()),
          expect.objectContaining({ displayMode: mode })
        );
      }
    });

    it("should handle regex replacement when katex throws", async () => {
      katexRenderMock.mockImplementation(() => {
        throw new Error("math error");
      });
      const { renderMarkdown } = await import("@/utils/markdown-renderer.js");

      const result = renderMarkdown("$fail$", false);
      expect(result).toContain('class="math-error"');
      expect(result).toContain("math error");
    });
  });

  describe("Shiki Highlighting Fallbacks", () => {
    it("should fall back to plain code when Shiki throws", async () => {
      // Setup Shiki to throw
      shikiMock.codeToHtml.mockImplementationOnce(() => {
        throw new Error("Shiki fail");
      });

      const { renderMarkdown } = await import("@/utils/markdown-renderer.js");
      const html = renderMarkdown("```js\nconst x = 1;\n```", false);

      expect(html).toContain("code-block-wrapper");
      // Fallback uses "shiki" class but just escapes content
      expect(html).toContain("const x = 1;");
      expect(domPurifySanitizeMock).toHaveBeenCalled();
    });

    it("should fall back when language is not loaded", async () => {
      shikiMock.getLoadedLanguages.mockReturnValue(["python"]); // js not loaded

      const { renderMarkdown } = await import("@/utils/markdown-renderer.js");
      renderMarkdown("```js\ncode\n```", false);

      // Should attempt with "plaintext" or similar fallback depending on implementation
      // The implementation falls back to "plaintext" if language not in list
      expect(shikiMock.codeToHtml).toHaveBeenCalledWith(
        expect.stringContaining("code"),
        expect.objectContaining({ lang: "plaintext" })
      );
    });
  });

  describe("Mermaid Re-render Logic", () => {
    it("should skip re-render if wrapper components are missing", async () => {
      await import("@/utils/markdown-renderer.js"); // Ensures module load

      // Manually trigger the private reRenderAllMermaidDiagrams via theme change
      document.body.innerHTML = `
        <div class="mermaid-wrapper" data-processed="true" data-mermaid-code="graph TD;A-->B;">
           <!-- Missing SVG -->
        </div>
        <div class="mermaid-wrapper" data-processed="true">
           <svg></svg>
           <!-- Missing data-mermaid-code -->
        </div>
      `;

      // Trigger theme change to fire re-render
      document.dispatchEvent(new Event("theme-changed"));

      // Wait for async re-render
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should not have called render for these invalid elements
      expect(mermaidRenderMock).not.toHaveBeenCalled();
    });

    it("should attempt re-render for valid wrappers", async () => {
      await import("@/utils/markdown-renderer.js");

      document.body.innerHTML = `
        <div class="mermaid-wrapper" data-processed="true" data-mermaid-code="graph TD;Valid-->Graph;">
           <svg viewBox="0 0 100 100"></svg>
        </div>
      `;

      document.dispatchEvent(new Event("theme-changed"));
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mermaidRenderMock).toHaveBeenCalledWith(
        expect.stringContaining("mermaid-rerender"),
        "graph TD;Valid-->Graph;"
      );
    });

    it("should fix missing height attribute on re-render", async () => {
      await import("@/utils/markdown-renderer.js");

      document.body.innerHTML = `
        <div class="mermaid-wrapper" data-processed="true" data-mermaid-code="graph TD;Height-->Fix;">
           <svg viewBox="0 0 100 50"></svg>
        </div>
      `;

      // Mock render to update DOM simulating mermaid
      mermaidRenderMock.mockImplementationOnce(async () => ({
        svg: '<svg viewBox="0 0 100 50"></svg>',
      }));

      document.dispatchEvent(new Event("theme-changed"));
      await new Promise((resolve) => setTimeout(resolve, 50));

      const svg = document.querySelector("svg");
      // The implementation logic fixes height if missing, based on viewbox
      expect(svg.getAttribute("height")).toBe("50");
    });
  });
});
