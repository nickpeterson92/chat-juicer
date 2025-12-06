import { beforeEach, describe, expect, it } from "vitest";
import {
  findSessionElement,
  getSessionIdFromElement,
  removeSessionItem,
  renderEmptySessionList,
  renderSessionItem,
  renderSessionList,
  updateSessionActive,
  updateSessionTitle,
} from "@/ui/renderers/session-list-renderer.js";

// Lightweight DOM adapter that proxies to the real DOM (happy-dom)
const createDomAdapter = () => ({
  createElement: (tag) => document.createElement(tag),
  addClass: (el, ...classes) => el.classList.add(...classes),
  removeClass: (el, cls) => el.classList.remove(cls),
  setAttribute: (el, name, value) => el.setAttribute(name, value),
  getAttribute: (el, name) => el.getAttribute(name),
  setTextContent: (el, text) => {
    el.textContent = text;
  },
  appendChild: (parent, child) => parent.appendChild(child),
  remove: (el) => el?.remove(),
  closest: (el, selector) => el?.closest(selector),
  querySelector: (el, selector) => el?.querySelector(selector),
  getDocument: () => document,
});

describe("Session List Renderer", () => {
  let domAdapter;

  beforeEach(() => {
    domAdapter = createDomAdapter();
    document.body.innerHTML = "";
  });

  it("renders a list of sessions and marks the active one", () => {
    const sessions = [
      { id: "s1", title: "One", created_at: "2024-01-01T00:00:00Z" },
      { id: "s2", title: "Two", created_at: "2024-01-02T00:00:00Z" },
    ];

    const fragment = renderSessionList(sessions, "s2", domAdapter);
    expect(fragment).not.toBeNull();

    const children = Array.from(fragment.childNodes || fragment.children);
    expect(children).toHaveLength(2);
    expect(children[0].classList.contains("active")).toBe(false);
    expect(children[1].classList.contains("active")).toBe(true);
  });

  it("returns null when no domAdapter is provided", () => {
    const result = renderSessionList([{ id: "s1", title: "One", created_at: "2024" }], "s1", null);
    expect(result).toBeNull();
  });

  it("renders empty state with provided message", () => {
    const empty = renderEmptySessionList("Nothing here", domAdapter);
    expect(empty.classList.contains("session-list-empty")).toBe(true);
    expect(empty.querySelector(".empty-message")?.textContent).toBe("Nothing here");
  });

  it("exposes helpers for session lookup and mutation", () => {
    const session = { id: "s1", title: "Initial", created_at: "2024-01-01T00:00:00Z" };
    const item = renderSessionItem(session, false, domAdapter);
    const container = document.createElement("div");
    container.appendChild(item);

    // find + get ID
    const found = findSessionElement(container, "s1", domAdapter);
    expect(found).toBe(item);
    expect(getSessionIdFromElement(found, domAdapter)).toBe("s1");

    // update active state
    updateSessionActive(found, true, domAdapter);
    expect(found.classList.contains("active")).toBe(true);

    // update title
    updateSessionTitle(found, "Updated", domAdapter);
    expect(found.querySelector(".session-title")?.textContent).toBe("Updated");

    // remove item
    removeSessionItem(found, domAdapter);
    expect(container.children.length).toBe(0);
  });
});
