export type SeoGuide = {
  slug: string;
  title: string;
  description: string;
  datePublished: string;
  hero: string;
  sections: Array<{ heading: string; body: string[] }>;
  related: Array<{ href: string; label: string }>;
};

export const seoGuides: SeoGuide[] = [
  {
    slug: "why-we-still-run-hackathons",
    title: "Why We Still Run Hackathons If DevLabs Is Becoming a Hiring Company",
    description:
      "Why DevLabs still runs hackathons and hacker houses while building a hiring company, and how those environments create unusually strong engineering talent signal.",
    datePublished: "2026-08-31",
    hero:
      "On paper, running hackathons is a terrible way to build a recruiting company. They're expensive. They take a lot of work. You need venues, sponsors, food, judging, operations, and a hundred tiny things that go wrong. So why keep doing them? Because the signal is insane.",
    sections: [
      {
        heading: "A resume is static",
        body: [
          "A hackathon is the opposite.",
          "You get to watch people make decisions. Some teams spend five hours arguing about the idea. Some start building immediately. Some people become the unofficial technical lead without anyone assigning them the role. Some builders keep the entire team moving. Some quietly disappear.",
          "You learn a lot.",
        ],
      },
      {
        heading: "Founders notice this too",
        body: [
          "We've had founders meet builders through DevLabs environments and eventually work with or hire them.",
          "That was one of the earliest signals that DevLabs could become more than a community. Companies didn't only want access to our Discord. They wanted access to the people they saw building.",
          "That distinction matters.",
        ],
      },
      {
        heading: "Events are part of the talent network",
        body: [
          "Most talent platforms start with a database and try to enrich it.",
          "We can start with real environments where builders show up and make things. That is harder to scale. But it also creates a type of signal that's hard to scrape from the internet.",
          "So yes, DevLabs is moving into hiring. We're still going to put builders in rooms together. It might actually be one of the biggest reasons the hiring product can work.",
        ],
      },
    ],
    related: [
      { href: "/hire/founding-engineers", label: "Hire founding engineers" },
      { href: "/hire/software-engineers", label: "Hire software engineers" },
      { href: "/guides/resumes-are-not-enough-for-hiring-engineers", label: "Resumes are not enough" },
    ],
  },
  {
    slug: "ai-changed-coding-technical-hiring-has-to-change",
    title: "AI Changed Coding. Technical Hiring Has to Change Too.",
    description:
      "Why technical hiring needs to adapt when engineers now build with AI coding tools, agents, Cursor, Claude Code, and Codex.",
    datePublished: "2026-08-31",
    hero:
      "A weird thing is happening in engineering interviews. Companies hire engineers who will spend all day using AI coding tools. Then they interview them in an environment where those tools are banned. I don't think that makes sense forever.",
    sections: [
      {
        heading: "I care less about whether you use AI",
        body: [
          "Of course you use AI. Most good engineers I know do now.",
          "The interesting part is how you use it.",
          "Can you give the model the right context? Can you recognize when it is confidently wrong? Do you understand the generated code? Can you debug when the agent gets stuck? Do you know when writing it yourself is faster? Can you make architectural decisions without asking Claude to make every decision for you?",
          "Those are increasingly real engineering skills.",
        ],
      },
      {
        heading: "Agent conversations might become a hiring signal",
        body: [
          "This is one of the things we're experimenting with at DevLabs.",
          "A resume shows the final claim: built an authentication system. An agent trace can potentially show some of the process.",
          "What did you ask? What did you notice? What went wrong? How did you recover? What decisions did you override?",
          "That is fascinating from a hiring perspective. Obviously, you shouldn't reduce someone to an AI conversation either. But combined with projects, code, and real outcomes, it can add another dimension.",
        ],
      },
      {
        heading: "Interviews should move closer to real work",
        body: [
          "I think technical hiring is going to get less artificial.",
          "Less memorization. Less pretending Google doesn't exist. Less pretending AI doesn't exist.",
          "More: here is a real problem. Here are the tools you normally use. Let's see how you approach it.",
          "That seems much closer to what companies actually want to know. Can this person build?",
        ],
      },
    ],
    related: [
      { href: "/hire/ai-engineers", label: "Hire AI engineers" },
      { href: "/guides/resumes-are-not-enough-for-hiring-engineers", label: "Resumes are not enough" },
      { href: "/hire/software-engineers", label: "Hire software engineers" },
    ],
  },
  {
    slug: "resumes-are-not-enough-for-hiring-engineers",
    title: "Resumes Are Fine. They're Just Not Enough for Hiring Engineers.",
    description:
      "Why resumes are useful but incomplete for engineering hiring, and why founders should look at projects, GitHub, hackathons, startup work, and AI tool usage.",
    datePublished: "2026-08-31",
    hero:
      "I don't think resumes are useless. They're actually pretty useful. In 30 seconds, I can understand where someone worked, what they studied, and roughly what they have done. The problem starts when we pretend that tells us how good they are at building. It doesn't.",
    sections: [
      {
        heading: "Two resumes can look almost identical",
        body: [
          "Imagine two engineers.",
          "Same university. Same internship. Same React, TypeScript, Python keywords. Both say they built scalable features.",
          "One of them has spent the last two years constantly shipping weird side projects, talking to users, debugging production issues, and trying things that failed. The other has barely built anything outside assigned work.",
          "Those are very different people. The resume makes them look almost the same.",
        ],
      },
      {
        heading: "So open the work",
        body: [
          "This is what I wish more hiring processes did.",
          "If they have GitHub, look at it. If they built a product, open it. If they won a hackathon, ask what happened during the hackathon. If they worked at a startup, ask what they personally owned. If they use Cursor, Claude Code, or Codex heavily, ask how.",
          "The interview becomes much more interesting once there is something real on the table.",
        ],
      },
      {
        heading: "AI makes this even more important",
        body: [
          "It's becoming ridiculously easy to create a good-looking application. You can rewrite your resume for every job. Generate a cover letter. Prepare perfect behavioral answers. Even practice technical interviews with AI.",
          "That means polished presentation is becoming cheaper. Actual building is still expensive.",
          "Someone still had to decide what to make. Debug it. Deploy it. Deal with users. Fix it after everything broke.",
          "That is why I think the work itself is becoming a more important hiring signal, not less.",
        ],
      },
      {
        heading: "This is basically why we pivoted DevLabs",
        body: [
          "We spent years putting builders in rooms together. Hackathons. Hacker houses. Projects. Startup programs.",
          "And founders kept noticing people through the work. Not because someone had the best resume in the room. Because they watched them build.",
          "DevLabs is basically us trying to turn that signal into a hiring product.",
        ],
      },
    ],
    related: [
      { href: "/hire/software-engineers", label: "Hire software engineers" },
      { href: "/guides/why-we-still-run-hackathons", label: "Why we still run hackathons" },
      { href: "/guides/ai-changed-coding-technical-hiring-has-to-change", label: "AI changed coding" },
    ],
  },
  {
    slug: "juicebox-finding-people-not-our-problem",
    title: "Juicebox Is Great at Finding People. That's Not the Problem We're Solving.",
    description:
      "A founder-facing explanation of how Juicebox and DevLabs approach different parts of engineering hiring: search breadth versus builder signal depth.",
    datePublished: "2026-08-31",
    hero:
      "I came across Juicebox because they are doing something really interesting in recruiting. You can describe who you're looking for in normal language and search across a huge talent market. Very useful product. But looking at Juicebox also made something click for us at DevLabs. We are solving a different part of the problem.",
    sections: [
      {
        heading: "Finding candidates is getting easier",
        body: [
          "LinkedIn has hundreds of millions of profiles. Juicebox makes those profiles easier to search. AI sourcing tools are getting much better. Recruiters can generate queries, lists, enrichment, and outreach faster than ever.",
          "The bottleneck is moving.",
        ],
      },
      {
        heading: "The next problem is signal",
        body: [
          "You find 100 engineers who look relevant. Now what?",
          "Which one actually owned the work on their resume? Who is good in an early startup? Who can build without a detailed spec? Who has strong product judgment? Who knows how to use AI tools without becoming dependent on them? Who would another strong builder want to work with?",
          "Search doesn't completely answer those questions.",
        ],
      },
      {
        heading: "That's where DevLabs is going",
        body: [
          "We started with a builder community. That means we have spent years seeing people through projects, hackathons, hacker houses, startups, and things they actually shipped.",
          "Now we're trying to make that useful for hiring.",
          "Juicebox is trying to help you search the talent market better. We're trying to help you understand the builder better.",
          "There is definitely overlap. But the starting point is very different. And I think early-stage founders especially need the second problem solved.",
        ],
      },
    ],
    related: [
      { href: "/alternatives/juicebox", label: "Juicebox alternative" },
      { href: "/compare/devlabs-vs-juicebox", label: "DevLabs vs Juicebox" },
      { href: "/hire/founding-engineers", label: "Hire founding engineers" },
    ],
  },
];

export function getGuide(slug: string) {
  return seoGuides.find((guide) => guide.slug === slug);
}
