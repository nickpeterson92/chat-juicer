import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mutationObservers = [];

const mermaidInitializeMock = vi.fn();
const mermaidRenderMock = vi.fn();
const katexRenderMock = vi.fn();
const domPurifySanitizeMock = vi.fn();
const markedParseMock = vi.fn();
const markedFootnoteParseMock = vi.fn();
let currentRenderer = null;
const markedUseMock = vi.fn((options) => {
  currentRenderer = options?.renderer ?? null;
});
const markedFootnoteUseMock = vi.fn();
const markedFootnotePluginFactory = vi.fn(() => "footnote-plugin");

vi.mock("dompurify", () => ({
  default: {
    sanitize: domPurifySanitizeMock,
  },
}));

vi.mock("highlight.js", () => ({
  default: {
    getLanguage: vi.fn(() => true),
    highlight: vi.fn((code, { language }) => ({
      value: `<span data-lang="${language}">${code}</span>`,
    })),
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

vi.mock("marked", () => {
  function Renderer() {}

  return {
    marked: {
      Renderer,
      parse: markedParseMock,
      use: markedUseMock,
    },
    Marked: vi.fn(function Marked(config) {
      this.config = config;
      this.parse = markedFootnoteParseMock;
      this.use = markedFootnoteUseMock;
      return this;
    }),
  };
});

vi.mock("marked-footnote", () => ({
  default: markedFootnotePluginFactory,
}));

// Use real css variable helper; set values in tests to avoid noisy warnings

let originalMutationObserver;

function createMutationObserverMock() {
  mutationObservers.length = 0;

  class MockMutationObserver {
    constructor(callback) {
      this.callback = callback;
      mutationObservers.push(this);
    }

    observe(target, options) {
      this.target = target;
      this.options = options;
    }

    disconnect() {}

    trigger(records) {
      this.callback(records);
    }
  }

  originalMutationObserver = globalThis.MutationObserver;
  globalThis.MutationObserver = MockMutationObserver;
}

describe("markdown-renderer", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useRealTimers();

    createMutationObserverMock();

    // Provide clipboard mock for copy button tests
    global.navigator = {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    };

    // Provide default CSS variables to avoid warnings
    document.documentElement.style.setProperty("--color-brand-primary", "#0066cc");
    document.documentElement.style.setProperty("--color-surface-1", "#ffffff");
    document.documentElement.style.setProperty("--color-text-primary", "#111111");
    document.documentElement.setAttribute("data-theme", "light");

    domPurifySanitizeMock.mockImplementation((html) => `sanitized:${html}`);
    markedParseMock.mockImplementation((input) => `<p>${input}</p>`);
    markedFootnoteParseMock.mockImplementation((input) => `<p>${input}-footnote</p>`);
    katexRenderMock.mockImplementation((math, { displayMode }) => `<span data-display="${displayMode}">${math}</span>`);
    mermaidRenderMock.mockResolvedValue({ svg: '<svg viewBox="0 0 10 20"></svg>' });
    currentRenderer = null;
  });

  afterEach(() => {
    document.body.innerHTML = "";
    if (originalMutationObserver) {
      globalThis.MutationObserver = originalMutationObserver;
      originalMutationObserver = undefined;
    }
    vi.useRealTimers();
  });

  it("renders markdown with math and footnotes when complete content is provided", async () => {
    const { renderMarkdown } = await import("@utils/markdown-renderer.js");

    const markdown = "Math $a^2$ and $$b^2$$ with footnote[^1]\n\n[^1]: note";
    const html = renderMarkdown(markdown, true);

    expect(katexRenderMock).toHaveBeenCalledTimes(2);
    expect(markedFootnoteParseMock).toHaveBeenCalledWith(expect.stringContaining("a^2"));
    expect(markedUseMock).toHaveBeenCalled();
    expect(markedFootnoteUseMock).toHaveBeenCalledWith("footnote-plugin");
    expect(domPurifySanitizeMock).toHaveBeenCalledWith(expect.stringContaining("<p>Math"), expect.any(Object));
    expect(html).toContain("sanitized:");
  });

  it("sanitizes and escapes unsafe markdown when parsing fails during streaming", async () => {
    markedParseMock.mockImplementationOnce(() => {
      throw new Error("parse failure");
    });

    const { renderMarkdown } = await import("@utils/markdown-renderer.js");

    const html = renderMarkdown("<script>alert(1)</script>", false);

    expect(domPurifySanitizeMock).toHaveBeenCalledWith("<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>");
    expect(html).toBe("sanitized:<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>");
  });

  it("processes mermaid diagrams and replaces blocks with rendered SVG wrappers", async () => {
    // Override mock to call custom renderer for code blocks
    markedParseMock.mockImplementation((input) => {
      const match = input.match(/```(\w*)\n([\s\S]*?)```/);
      if (match && currentRenderer?.code) {
        return currentRenderer.code({ lang: match[1], text: match[2] });
      }
      return `<p>${input}</p>`;
    });

    const { processMermaidDiagrams, renderMarkdown } = await import("@utils/markdown-renderer.js");

    const container = document.createElement("div");
    // Use renderMarkdown to properly populate the code store
    container.innerHTML = renderMarkdown("```mermaid\ngraph TD;A-->B;\n```", false);
    document.body.appendChild(container);

    await processMermaidDiagrams(container);

    const wrapper = container.querySelector(".mermaid-wrapper");
    expect(wrapper).toBeTruthy();
    expect(wrapper?.dataset.processed).toBe("true");
    expect(wrapper?.dataset.mermaidCode).toContain("graph TD;A-->B;");

    const svg = wrapper?.querySelector("svg");
    expect(svg?.getAttribute("height")).toBe("20");
  });

  it("surfaces mermaid render errors as error blocks", async () => {
    // Override mock to call custom renderer for code blocks
    markedParseMock.mockImplementation((input) => {
      const match = input.match(/```(\w*)\n([\s\S]*?)```/);
      if (match && currentRenderer?.code) {
        return currentRenderer.code({ lang: match[1], text: match[2] });
      }
      return `<p>${input}</p>`;
    });

    mermaidRenderMock.mockRejectedValueOnce(new Error("diagram boom"));
    const { processMermaidDiagrams, renderMarkdown } = await import("@utils/markdown-renderer.js");

    const container = document.createElement("div");
    // Use renderMarkdown to properly populate the code store
    container.innerHTML = renderMarkdown("```mermaid\ngraph TD;X-->Y;\n```", false);
    document.body.appendChild(container);

    await processMermaidDiagrams(container);

    // Error is now inside a wrapper with dataset.processed on the wrapper
    const wrapper = container.querySelector(".mermaid-wrapper");
    expect(wrapper).toBeTruthy();
    expect(wrapper?.dataset.processed).toBe("error");

    const errorDiv = wrapper?.querySelector(".mermaid-error");
    expect(errorDiv).toBeTruthy();
    expect(errorDiv?.textContent).toContain("diagram boom");
  });

  it("re-initializes mermaid on theme change signals", async () => {
    const { hasMarkdown } = await import("@utils/markdown-renderer.js");

    expect(hasMarkdown("## Title")).toBe(true);

    const observer = mutationObservers[0];
    expect(observer).toBeDefined();

    const initialCalls = mermaidInitializeMock.mock.calls.length;

    document.documentElement.setAttribute("data-theme", "dark");
    observer.trigger([{ type: "attributes", attributeName: "data-theme" }]);

    document.dispatchEvent(new Event("theme-changed"));

    expect(mermaidInitializeMock.mock.calls.length).toBeGreaterThanOrEqual(initialCalls + 2);
  });

  it("uses custom renderer for code blocks and falls back when language is unknown", async () => {
    // Force highlight fallback
    const hljs = (await import("highlight.js")).default;
    hljs.getLanguage.mockReturnValueOnce(true).mockReturnValueOnce(false);
    hljs.highlight.mockReturnValueOnce({ value: "highlighted" });

    markedParseMock.mockImplementation((input) => {
      const match = input.match(/```(\w*)\n([\s\S]*?)```/);
      if (match && currentRenderer?.code) {
        return currentRenderer.code({ lang: match[1], text: match[2] });
      }
      return `<p>${input}</p>`;
    });

    const { renderMarkdown } = await import("@utils/markdown-renderer.js");

    const highlighted = renderMarkdown("```js\nconst a = 1;\n```", false);
    expect(highlighted).toContain("language-js");

    const fallback = renderMarkdown("```unknown\ncode\n```", false);
    expect(fallback).toContain("hljs");
  });

  it("returns empty string when markdown is empty", async () => {
    const { renderMarkdown } = await import("@utils/markdown-renderer.js");
    expect(renderMarkdown("")).toBe("");
  });

  it("renders math errors when KaTeX throws", async () => {
    katexRenderMock.mockImplementationOnce(() => {
      throw new Error("math fail");
    });
    const { renderMarkdown } = await import("@utils/markdown-renderer.js");
    const html = renderMarkdown("$1+1$", false);
    expect(html).toContain("math-error");
  });

  it("handles mermaid processing with missing inputs gracefully", async () => {
    const { processMermaidDiagrams } = await import("@utils/markdown-renderer.js");
    await expect(processMermaidDiagrams(null)).resolves.toBeUndefined();

    const container = document.createElement("div");
    container.innerHTML = "<p>no diagrams here</p>";
    await expect(processMermaidDiagrams(container)).resolves.toBeUndefined();
  });

  it("detects absence of markdown syntax", async () => {
    const { hasMarkdown } = await import("@utils/markdown-renderer.js");
    expect(hasMarkdown("plain text only")).toBe(false);
  });

  it("ignores copy button initialization when container is missing", async () => {
    const { initializeCodeCopyButtons } = await import("@utils/markdown-renderer.js");
    expect(() => initializeCodeCopyButtons(null)).not.toThrow();
  });

  it("initializes copy buttons and restores state after copy success", async () => {
    vi.useFakeTimers();
    const { initializeCodeCopyButtons } = await import("@utils/markdown-renderer.js");

    const container = document.createElement("div");
    container.innerHTML = '<button class="code-copy-btn" data-code="console.log(&quot;hi&quot;);">copy</button>';
    document.body.appendChild(container);

    initializeCodeCopyButtons(container);

    const button = container.querySelector(".code-copy-btn");
    button?.dispatchEvent(new Event("click", { bubbles: true }));

    await Promise.resolve();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('console.log("hi");');
    expect(button?.classList.contains("copied")).toBe(true);

    await vi.runAllTimersAsync();
    expect(button?.classList.contains("copied")).toBe(false);
  });

  it("shows error feedback when copy fails and restores original content", async () => {
    vi.useFakeTimers();
    navigator.clipboard.writeText.mockRejectedValueOnce(new Error("copy failed"));

    const { initializeCodeCopyButtons } = await import("@utils/markdown-renderer.js");

    const container = document.createElement("div");
    container.innerHTML = '<button class="code-copy-btn" data-code="let x = 1;">copy</button>';
    document.body.appendChild(container);

    initializeCodeCopyButtons(container);
    const button = container.querySelector(".code-copy-btn");

    button?.dispatchEvent(new Event("click", { bubbles: true }));
    await Promise.resolve();

    expect(button?.innerHTML).toContain("<line");

    await vi.runAllTimersAsync();
    expect(button?.textContent).toBe("copy");
  });
});
