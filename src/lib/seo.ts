export const SITE_URL = "https://www.devlabs.club";
export const SITE_NAME = "DevLabs";

export const seoKeywords = [
  "startup hiring platform",
  "hire founding engineers",
  "hire software engineers",
  "hire AI engineers",
  "proof of work hiring",
  "technical recruiting for startups",
  "vetted startup engineers",
  "Juicebox alternative",
  "AI recruiting software alternative",
].join(", ");

export function absoluteUrl(path = "/") {
  return new URL(path, SITE_URL).href;
}

export const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": absoluteUrl("/#organization"),
  name: SITE_NAME,
  url: SITE_URL,
  logo: absoluteUrl("/logo.png"),
  sameAs: [
    "https://www.linkedin.com/company/devlabsclub/",
    "https://twitter.com/devlabs_club",
    "https://www.instagram.com/devlabs.asu/",
  ],
};

export const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": absoluteUrl("/#website"),
  name: SITE_NAME,
  url: SITE_URL,
  publisher: { "@id": absoluteUrl("/#organization") },
};

export function breadcrumbSchema(items: Array<{ name: string; path: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function articleSchema(params: {
  title: string;
  description: string;
  path: string;
  datePublished: string;
  dateModified?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: params.title,
    description: params.description,
    datePublished: params.datePublished,
    dateModified: params.dateModified ?? params.datePublished,
    mainEntityOfPage: absoluteUrl(params.path),
    author: { "@id": absoluteUrl("/#organization") },
    publisher: { "@id": absoluteUrl("/#organization") },
  };
}

export const seoHubLinks = [
  { href: "/hire/founding-engineers", label: "Founding engineers" },
  { href: "/hire/software-engineers", label: "Software engineers" },
  { href: "/hire/ai-engineers", label: "AI engineers" },
  { href: "/compare/devlabs-vs-juicebox", label: "DevLabs vs Juicebox" },
  { href: "/alternatives/juicebox", label: "Juicebox alternative" },
  { href: "/guides/resumes-are-not-enough-for-hiring-engineers", label: "Hiring guide" },
];
