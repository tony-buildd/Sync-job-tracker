import { describe, expect, it } from "vitest";
import { deriveCanonicalIdentity, parseJobUrl } from "./job-matching";

describe("parseJobUrl", () => {
  it("extracts the same Nutrien external job id from two source variants", () => {
    const linkedInVariant = parseJobUrl(
      "https://jobs.nutrien.com/North-America/job/Augusta-Process-Engineer-GA-30903/30186-en_US/?feedId=349960&utm_source=LinkedInJobPostings&jr_id=69c8912ab773006330b7fb8d",
    );
    const directVariant = parseJobUrl(
      "https://jobs.nutrien.com/North-America/job/Process-Engineer/30186-en_US/",
    );

    expect(linkedInVariant.companyName).toBe("Nutrien");
    expect(directVariant.companyName).toBe("Nutrien");
    expect(linkedInVariant.externalJobId).toBe("30186-en_US");
    expect(directVariant.externalJobId).toBe("30186-en_US");
    expect(linkedInVariant.primaryCanonicalKey).toBe(directVariant.primaryCanonicalKey);
  });

  it("extracts the same Amgen external job id from two source variants", () => {
    const linkedInVariant = parseJobUrl(
      "https://careers.amgen.com/en/job/-/-/87/93284715648?src=Linkedin&jr_id=69c7ec581818a24cd84d24d5",
    );
    const directVariant = parseJobUrl(
      "https://careers.amgen.com/en/job/cambridge/process-development-associate/87/93284715648",
    );

    expect(linkedInVariant.companyName).toBe("Amgen");
    expect(directVariant.companyName).toBe("Amgen");
    expect(linkedInVariant.externalJobId).toBe("93284715648");
    expect(directVariant.externalJobId).toBe("93284715648");
    expect(linkedInVariant.primaryCanonicalKey).toBe(directVariant.primaryCanonicalKey);
  });

  it("builds a conservative fallback canonical key when no external id exists", () => {
    const identity = deriveCanonicalIdentity({
      companyName: "Acme Inc",
      jobTitle: "Software Engineer",
      jobLocation: "Remote",
      externalJobId: null,
    });

    expect(identity.primaryCanonicalKey).toBeNull();
    expect(identity.fallbackCanonicalKey).toBe(
      "fallback:acme inc::software engineer::remote",
    );
  });

  it("normalizes punctuation and case for consistent canonical keys", () => {
    const left = deriveCanonicalIdentity({
      companyName: "Acme, Inc.",
      jobTitle: "Senior Data Engineer",
      jobLocation: "San Francisco, CA",
      externalJobId: "ABC-1234",
    });
    const right = deriveCanonicalIdentity({
      companyName: "acme inc",
      jobTitle: "senior data engineer",
      jobLocation: "san francisco ca",
      externalJobId: "ABC-1234",
    });

    expect(left.normalizedCompany).toBe("acme inc");
    expect(left.primaryCanonicalKey).toBe(right.primaryCanonicalKey);
  });
});
