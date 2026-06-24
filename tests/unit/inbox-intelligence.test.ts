import { describe, it, expect } from "vitest";
import { classifyMessage } from "../../api/_lib/inbox-intelligence";

describe("A11 — Inbox Intelligence classification", () => {
  it("classifies interview invitations", () => {
    const r = classifyMessage({
      subject: "Invitation to interview at Acme",
      body: "We'd love to schedule a technical interview with you next week.",
      fromAddress: "recruiting@acme.com",
    });
    expect(r.classification).toBe("interview");
    expect(r.confidence).toBeGreaterThan(0.5);
  });

  it("classifies assessment links", () => {
    const r = classifyMessage({
      subject: "Your HackerRank assessment",
      body: "Please complete the codesignal assessment within 48 hours.",
      fromAddress: "no-reply@hackerrank.com",
    });
    expect(r.classification).toBe("assessment");
  });

  it("classifies offers", () => {
    const r = classifyMessage({
      subject: "Offer from Acme",
      body: "We are pleased to offer you the role. Please review the compensation package.",
      fromAddress: "talent@acme.com",
    });
    expect(r.classification).toBe("offer");
  });

  it("classifies rejections", () => {
    const r = classifyMessage({
      subject: "Update on your application",
      body: "We regret to inform you that we are not moving forward with your application.",
      fromAddress: "careers@acme.com",
    });
    expect(r.classification).toBe("rejection");
  });

  it("classifies recruiter replies", () => {
    const r = classifyMessage({
      subject: "Re: Following up",
      body: "Thanks for reaching out — happy to chat next week.",
      fromAddress: "recruiter@acme.com",
    });
    expect(r.classification).toBe("recruiter_reply");
  });

  it("falls back to 'other' for unrelated mail", () => {
    const r = classifyMessage({
      subject: "Your newsletter",
      body: "This week in tech — 10 articles to read.",
      fromAddress: "news@digest.com",
    });
    expect(r.classification).toBe("other");
  });
});
