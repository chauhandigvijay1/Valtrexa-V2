import { describe, it, expect } from "vitest";
import {
  scoreContact,
  isPlausibleEmail,
  isPlausibleName,
  fallbackContacts,
} from "../../api/_lib/recruiter-discovery";

describe("A6 — Recruiter Discovery Engine", () => {
  it("never fabricates emails — only accepts well-shaped, verifiable ones", () => {
    expect(isPlausibleEmail("jane.doe@acme.com")).toBe(true);
    expect(isPlausibleEmail(null)).toBe(false);
    expect(isPlausibleEmail("not-an-email")).toBe(false);
    expect(isPlausibleEmail("team")).toBe(false);
  });

  it("rejects generic team mailboxes as a named person", () => {
    expect(isPlausibleName("Jane Doe")).toBe(true);
    expect(isPlausibleName("Acme Recruiting Team")).toBe(false);
    expect(isPlausibleName("careers@acme.com")).toBe(false);
    expect(isPlausibleName("HR")).toBe(false);
  });

  it("scores verified LinkedIn URLs higher than unverified guesses", () => {
    const verified = scoreContact({
      name: "Jane Doe",
      role: "Recruiter",
      requestedRole: "Recruiter",
      profileUrl: "https://www.linkedin.com/in/janedoe",
      email: "jane@acme.com",
      source: "official",
    });
    const unverified = scoreContact({
      name: "Acme Recruiting Team",
      role: "Recruiter",
      requestedRole: "Recruiter",
      profileUrl: null,
      email: null,
      source: "fallback",
    });
    expect(verified).toBeGreaterThan(unverified);
    expect(verified).toBeLessThanOrEqual(0.97); // never perfect
    expect(unverified).toBeLessThan(0.5);
  });

  it("fallback contacts never include emails or fabricated profile URLs", () => {
    const contacts = fallbackContacts("Acme", "Frontend Developer");
    expect(contacts.length).toBeGreaterThan(0);
    for (const c of contacts) {
      expect(c.email).toBeNull();
      expect(c.email_verified).toBe(false);
      expect(c.confidence_score).toBeLessThan(0.5);
    }
  });
});
