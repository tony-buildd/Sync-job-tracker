import {
  normalizeHostname,
  extractJobIds,
  parseJobUrl,
  companyFromDomain,
} from "../lib/fingerprint";

describe("normalizeHostname", () => {
  it("strips 'jobs.' subdomain", () => {
    expect(normalizeHostname("jobs.nutrien.com")).toBe("nutrien.com");
  });
  it("strips 'careers.' subdomain", () => {
    expect(normalizeHostname("careers.amgen.com")).toBe("amgen.com");
  });
  it("strips 'www.' prefix", () => {
    expect(normalizeHostname("www.example.com")).toBe("example.com");
  });
  it("leaves a plain domain unchanged", () => {
    expect(normalizeHostname("example.com")).toBe("example.com");
  });
  it("lowercases the result", () => {
    expect(normalizeHostname("Jobs.NUTRIEN.Com")).toBe("nutrien.com");
  });
});

describe("extractJobIds", () => {
  it("extracts a pure numeric path segment", () => {
    expect(extractJobIds("/en/job/-/-/87/93284715648")).toEqual(["87", "93284715648"]);
  });
  it("extracts leading digits from a locale-suffixed segment", () => {
    expect(extractJobIds("/North-America/job/30186-en_US/")).toEqual(["30186"]);
  });
  it("ignores text-only segments", () => {
    expect(extractJobIds("/North-America/job/Process-Engineer/")).toEqual([]);
  });
  it("ignores mixed text segments that are not locale-suffixed", () => {
    // "GA-30903" is not in the <digits>-<alpha>_<ALPHA> pattern so should be ignored
    expect(extractJobIds("/Augusta-Process-Engineer-GA-30903/")).toEqual([]);
  });
  it("handles paths with no numeric segments", () => {
    expect(extractJobIds("/en/job/software-engineer/")).toEqual([]);
  });
});

describe("parseJobUrl – Nutrien examples", () => {
  const url1 =
    "https://jobs.nutrien.com/North-America/job/Augusta-Process-Engineer-GA-30903/30186-en_US/?feedId=349960&utm_source=LinkedInJobPostings&jr_id=69c8912ab773006330b7fb8d";
  const url2 =
    "https://jobs.nutrien.com/North-America/job/Process-Engineer/30186-en_US/";

  it("both Nutrien URLs produce the same fingerprint", () => {
    expect(parseJobUrl(url1).fingerprint).toBe(parseJobUrl(url2).fingerprint);
  });

  it("fingerprint contains the company domain", () => {
    expect(parseJobUrl(url1).fingerprint).toContain("nutrien.com");
  });

  it("fingerprint contains the job ID", () => {
    expect(parseJobUrl(url1).fingerprint).toContain("30186");
  });
});

describe("parseJobUrl – Amgen examples", () => {
  const url1 =
    "https://careers.amgen.com/en/job/-/-/87/93284715648?src=Linkedin&jr_id=69c7ec581818a24cd84d24d5";
  const url2 =
    "https://careers.amgen.com/en/job/cambridge/process-development-associate/87/93284715648";

  it("both Amgen URLs produce the same fingerprint", () => {
    expect(parseJobUrl(url1).fingerprint).toBe(parseJobUrl(url2).fingerprint);
  });

  it("fingerprint contains the company domain", () => {
    expect(parseJobUrl(url1).fingerprint).toContain("amgen.com");
  });

  it("fingerprint contains both numeric IDs", () => {
    const fp = parseJobUrl(url1).fingerprint;
    expect(fp).toContain("87");
    expect(fp).toContain("93284715648");
  });
});

describe("parseJobUrl – general", () => {
  it("throws on an invalid URL", () => {
    expect(() => parseJobUrl("not-a-url")).toThrow();
  });

  it("falls back to pathname when no numeric IDs are found", () => {
    const result = parseJobUrl("https://example.com/jobs/software-engineer");
    expect(result.fingerprint).toContain("example.com");
    expect(result.fingerprint).toContain("/jobs/software-engineer");
  });
});

describe("companyFromDomain", () => {
  it("capitalises the first segment", () => {
    expect(companyFromDomain("nutrien.com")).toBe("Nutrien");
  });
  it("works for multi-segment domains", () => {
    expect(companyFromDomain("amgen.com")).toBe("Amgen");
  });
});
