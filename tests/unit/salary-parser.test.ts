import { describe, it, expect } from "vitest";
import { parseSalary, salaryToYearlyUSD, extractSalaries } from "../../api/_lib/salary-parser.js";

describe("parseSalary", () => {
  it("handles empty/null input", () => {
    const r = parseSalary(null);
    expect(r.min).toBeNull();
    expect(r.max).toBeNull();
    expect(r.currency).toBe("USD");
  });

  it("parses $80k - $120k range", () => {
    const r = parseSalary("$80k - $120k");
    expect(r.min).toBe(80000);
    expect(r.max).toBe(120000);
    expect(r.currency).toBe("USD");
  });

  it("parses $80,000 - $120,000 range", () => {
    const r = parseSalary("$80,000 - $120,000");
    expect(r.min).toBe(80000);
    expect(r.max).toBe(120000);
  });

  it("parses ₹15L - ₹20L range (Indian Lakhs)", () => {
    const r = parseSalary("₹15L - ₹20L");
    expect(r.min).toBe(1500000);
    expect(r.max).toBe(2000000);
    expect(r.currency).toBe("INR");
  });

  it("parses ₹15LPA - ₹20LPA", () => {
    const r = parseSalary("₹15LPA - ₹20LPA");
    expect(r.min).toBe(1500000);
    expect(r.max).toBe(2000000);
  });

  it("parses €50k-€70k range", () => {
    const r = parseSalary("€50k-€70k");
    expect(r.min).toBe(50000);
    expect(r.max).toBe(70000);
    expect(r.currency).toBe("EUR");
  });

  it("parses £40,000 - £50,000 range", () => {
    const r = parseSalary("£40,000 - £50,000");
    expect(r.min).toBe(40000);
    expect(r.max).toBe(50000);
    expect(r.currency).toBe("GBP");
  });

  it("parses $30/hr - $45/hr hourly", () => {
    const r = parseSalary("$30/hr - $45/hr");
    expect(r.min).toBe(62400);
    expect(r.max).toBe(93600);
    expect(r.period).toBe("yearly");
  });

  it("parses $4,000/mo monthly", () => {
    const r = parseSalary("$4,000/mo");
    expect(r.min).toBe(38400);
    expect(r.max).toBe(57600);
  });

  it("returns nulls for competitive/negotiable", () => {
    const r = parseSalary("Competitive salary based on experience");
    expect(r.min).toBeNull();
    expect(r.max).toBeNull();
  });

  it("returns nulls for DOE", () => {
    const r = parseSalary("DOE");
    expect(r.min).toBeNull();
    expect(r.max).toBeNull();
  });

  it("extracts from full description", () => {
    const desc = "We offer a competitive salary of $90,000 - $110,000 per year plus benefits";
    const r = parseSalary(desc);
    expect(r.min).toBe(90000);
    expect(r.max).toBe(110000);
  });
});

describe("salaryToYearlyUSD", () => {
  it("converts INR to USD", () => {
    const parsed = parseSalary("₹20L - ₹30L");
    const usd = salaryToYearlyUSD(parsed);
    expect(usd.min).toBe(24000);
    expect(usd.max).toBe(36000);
  });

  it("converts EUR to USD", () => {
    const parsed = parseSalary("€60k-€80k");
    const usd = salaryToYearlyUSD(parsed);
    expect(usd.min).toBe(64800);
    expect(usd.max).toBe(86400);
  });

  it("passes through USD unchanged", () => {
    const parsed = parseSalary("$100k-$130k");
    const usd = salaryToYearlyUSD(parsed);
    expect(usd.min).toBe(100000);
    expect(usd.max).toBe(130000);
  });
});

describe("extractSalaries", () => {
  it("extracts salary from description", () => {
    const result = extractSalaries(
      "Software Engineer",
      "Join our team. Salary: $120k - $150k annually. Great benefits!",
      "San Francisco, CA",
    );
    expect(result.salary_min).toBe(120000);
    expect(result.salary_max).toBe(150000);
  });

  it("extracts INR salary from title", () => {
    const result = extractSalaries(
      "SDE 2 (₹18LPA - ₹25LPA)",
      "Looking for experienced developers",
      "Bangalore, India",
    );
    expect(result.salary_min).toBe(21600);
    expect(result.salary_max).toBe(30000);
  });

  it("returns null when no salary found", () => {
    const result = extractSalaries("Intern", "Looking for a motivated intern", "Remote");
    expect(result.salary_min).toBeNull();
    expect(result.salary_max).toBeNull();
  });
});
